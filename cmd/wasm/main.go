//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"runtime"
	"runtime/debug"
	"syscall/js"

	"frontlinecommand/pkg/sim"
)

// The worker calls functions on globalThis.__frontlineGo. Every call returns
// {ok: true, json?: string, bytes?: Uint8Array} or {ok: false, error: string}
// where error is the JSON encoding of Error. Engine panics are contained,
// reported as non-recoverable "engine_fault" and poison the session so a
// possibly inconsistent state can never be saved or advanced.
func main() {
	session, err := NewSession()
	exit := make(chan struct{})
	faulted := ""
	api := js.Global().Get("Object").New()
	register := func(name string, fn func(args []js.Value) (any, []byte, error)) {
		api.Set(name, js.FuncOf(func(this js.Value, args []js.Value) (out any) {
			defer func() {
				if r := recover(); r != nil {
					faulted = fmt.Sprintf("%s panicked: %v\n%s", name, r, debug.Stack())
					out = failure(&Error{Code: "engine_fault", Message: faulted, Recoverable: false})
				}
			}()
			if err != nil {
				return failure(&Error{Code: "startup_failed", Message: err.Error(), Recoverable: false})
			}
			if faulted != "" && name != "dispose" && name != "exit" && name != "version" {
				return failure(&Error{Code: "engine_fault", Message: "The engine faulted earlier; dispose this worker. " + faulted, Recoverable: false})
			}
			value, data, callErr := fn(args)
			if callErr != nil {
				return failure(callErr)
			}
			result := map[string]any{"ok": true}
			if value != nil {
				b, _ := json.Marshal(value)
				result["json"] = string(b)
			}
			if data != nil {
				arr := js.Global().Get("Uint8Array").New(len(data))
				js.CopyBytesToJS(arr, data)
				result["bytes"] = arr
			}
			return js.ValueOf(result)
		}))
	}
	register("version", func([]js.Value) (any, []byte, error) {
		info := map[string]any{"adapter": AdapterVersion, "simulation": sim.Version, "protocol": ProtocolVersion, "go": runtime.Version(), "tick_rate": sim.TickRate}
		if session != nil {
			info["content_hash"] = session.catalog.Hash()
		}
		return info, nil, nil
	})
	register("create", func(a []js.Value) (any, []byte, error) {
		if len(a) != 1 || a[0].Type() != js.TypeString {
			return nil, nil, fail("invalid_config", "create expects a JSON string.", true)
		}
		return withInfo(session.Create([]byte(a[0].String())))
	})
	register("submit", func(a []js.Value) (any, []byte, error) {
		player, err := playerArg(a, 0)
		if err != nil {
			return nil, nil, err
		}
		data, err := bytesArg(a, 1)
		if err != nil {
			return nil, nil, err
		}
		return nil, nil, session.Submit(player, data)
	})
	register("step", func(a []js.Value) (any, []byte, error) {
		if len(a) != 1 || a[0].Type() != js.TypeNumber || a[0].Float() != float64(a[0].Int()) {
			return nil, nil, fail("invalid_step", "step expects a tick count.", true)
		}
		return withInfo(session.Step(a[0].Int()))
	})
	register("view", func(a []js.Value) (any, []byte, error) {
		player, err := playerArg(a, 0)
		if err != nil {
			return nil, nil, err
		}
		b, err := session.View(player)
		return nil, b, err
	})
	register("hash", func([]js.Value) (any, []byte, error) {
		h, err := session.Hash()
		return h, nil, err
	})
	register("info", func([]js.Value) (any, []byte, error) { return session.Info(), nil, nil })
	register("save", func([]js.Value) (any, []byte, error) {
		r, err := session.Save()
		if err != nil {
			return nil, nil, err
		}
		return r, r.Data, nil
	})
	register("inspect", func(a []js.Value) (any, []byte, error) {
		data, err := bytesArg(a, 0)
		if err != nil {
			return nil, nil, err
		}
		meta, tick, err := session.Inspect(data)
		if err != nil {
			return nil, nil, err
		}
		return map[string]any{"metadata": meta, "tick": tick}, nil, nil
	})
	register("load", func(a []js.Value) (any, []byte, error) {
		data, err := bytesArg(a, 0)
		if err != nil {
			return nil, nil, err
		}
		if len(a) < 2 || a[1].Type() != js.TypeString {
			return nil, nil, fail("save_invalid", "load expects the local player list as JSON.", true)
		}
		var local []sim.PlayerID
		if json.Unmarshal([]byte(a[1].String()), &local) != nil {
			return nil, nil, fail("save_invalid", "Local player list is malformed.", true)
		}
		return withInfo(session.Load(data, local))
	})
	register("dispose", func([]js.Value) (any, []byte, error) {
		if session != nil {
			session.Dispose()
		}
		return nil, nil, nil
	})
	register("exit", func([]js.Value) (any, []byte, error) {
		select {
		case <-exit:
		default:
			close(exit)
		}
		return nil, nil, nil
	})
	js.Global().Set("__frontlineGo", api)
	if ready := js.Global().Get("__frontlineGoReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}
	<-exit
	js.Global().Delete("__frontlineGo")
}

func withInfo(info Info, err error) (any, []byte, error) {
	if err != nil {
		return nil, nil, err
	}
	return info, nil, nil
}

func failure(err error) js.Value {
	e, ok := err.(*Error)
	if !ok {
		e = &Error{Code: "internal", Message: err.Error(), Recoverable: false}
	}
	b, _ := json.Marshal(e)
	return js.ValueOf(map[string]any{"ok": false, "error": string(b)})
}

func playerArg(a []js.Value, i int) (sim.PlayerID, error) {
	if len(a) <= i || a[i].Type() != js.TypeNumber {
		return 0, fail("invalid_player", "Expected a player ID.", true)
	}
	v := a[i].Float()
	if v < 1 || v > 0xffffffff || v != float64(uint32(v)) {
		return 0, fail("invalid_player", "Player ID is out of range.", true)
	}
	return sim.PlayerID(uint32(v)), nil
}

func bytesArg(a []js.Value, i int) ([]byte, error) {
	if len(a) <= i || !a[i].InstanceOf(js.Global().Get("Uint8Array")) {
		return nil, fail("invalid_argument", "Expected a Uint8Array.", true)
	}
	n := a[i].Get("length").Int()
	if n > maxSaveBytes {
		return nil, fail("invalid_argument", "Binary argument exceeds 64 MiB.", true)
	}
	b := make([]byte, n)
	js.CopyBytesToGo(b, a[i])
	return b, nil
}
