package server

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	pb "frontlinecommand/protocol"
	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"
)

func TestEliminatedPlayerReceivesFinalViewBeforeTerminalClose(t *testing.T) {
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	tokens := []string{profile(t, h, "First"), profile(t, h, "Second"), profile(t, h, "Third")}
	lobby := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", tokens[0], map[string]any{"name": "Delivery test", "map_id": m.ID, "mode": "ffa", "faction": "US"}, 201))
	for _, token := range tokens[1:] {
		request(t, h, "POST", "/api/v1/lobbies/"+lobby.ID+"/join", token, map[string]any{"faction": "IR"}, 200)
	}
	readyTestLobby(t, s, h, lobby.ID, tokens...)
	request(t, h, "POST", "/api/v1/lobbies/"+lobby.ID+"/start", tokens[0], map[string]any{}, 201)
	sockets := make([]*websocket.Conn, 0, 3)
	for _, token := range tokens {
		joined := request(t, h, "GET", "/api/v1/lobbies/"+lobby.ID, token, nil, 200)
		var connection map[string]any
		json.Unmarshal(joined["connection"], &connection)
		socket, _ := socket(t, h, s, connection)
		sockets = append(sockets, socket)
		defer socket.CloseNow()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	read := func() *pb.Envelope {
		t.Helper()
		_, data, err := sockets[0].Read(ctx)
		if err != nil {
			t.Fatal("socket closed before terminal delivery", err)
		}
		message := new(pb.Envelope)
		if err = proto.Unmarshal(data, message); err != nil {
			t.Fatal(err)
		}
		return message
	}
	for {
		message := read()
		if d := message.GetDelta(); d != nil && d.State.Countdown == 0 {
			break
		}
		if snapshot := message.GetSnapshot(); snapshot != nil && snapshot.Countdown == 0 {
			break
		}
	}
	data, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Orders{Orders: &pb.OrderBatch{Sequence: 1, Orders: []*pb.Order{{Kind: "surrender"}}}}})
	if err := sockets[0].Write(ctx, websocket.MessageBinary, data); err != nil {
		t.Fatal(err)
	}
	var final *pb.PlayerSnapshot
	for {
		message := read()
		if snapshot := message.GetSnapshot(); snapshot != nil {
			final = snapshot
		}
		if protocolError := message.GetError(); protocolError != nil {
			if protocolError.Code != "player_eliminated" || protocolError.Recoverable {
				t.Fatal("wrong terminal reason", protocolError)
			}
			break
		}
	}
	if final == nil || final.Player != 1 || final.Outcome != nil && final.Outcome.Finished {
		t.Fatal("missing pre-result final authorized view", final)
	}
	defeated := false
	for _, player := range final.Players {
		if player.Id == 1 {
			defeated = player.Defeated
		}
	}
	if !defeated {
		t.Fatal("terminal reason arrived before defeated snapshot")
	}
	accepted := false
	for _, result := range final.Results {
		if result.Sequence == 1 && result.Accepted {
			accepted = true
		}
	}
	if !accepted {
		t.Fatal("accepted surrender receipt was dropped", final.Results)
	}
	for _, entity := range final.Entities {
		if entity.Owner != 0 && entity.Owner != 1 {
			t.Fatal("elimination revealed opponents", entity.Id)
		}
	}
	closeCtx, stop := context.WithTimeout(context.Background(), 2*time.Second)
	defer stop()
	if _, _, err := sockets[0].Read(closeCtx); err == nil {
		t.Fatal("terminal connection kept streaming")
	}
}

func TestPeerFinishDoesNotBlockFullQueue(t *testing.T) {
	p := &peer{out: make(chan []byte, 1), done: make(chan struct{})}
	p.out <- []byte{1}
	p.finish()
	select {
	case <-p.done:
	default:
		t.Fatal("full outbound queue was not closed")
	}
	q := &peer{out: make(chan []byte, 2), done: make(chan struct{})}
	q.out <- []byte{2}
	q.finish()
	if first := <-q.out; len(first) != 1 || first[0] != 2 {
		t.Fatal("end marker reordered earlier frame")
	}
	if last := <-q.out; last != nil {
		t.Fatal("missing FIFO end marker")
	}
}
