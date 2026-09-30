import {useState} from 'react';
import type {Lobby} from '../../runtime/api';
import type {NetworkController} from '../../app/network-controller';
import {STANDARD_STARTING_CREDITS,confirmedLobbyStartingCredits,formatStartingCredits,hasPrescribedStartingMoney,lobbyStartingMoneyLock,parseStartingCredits,startingMoneyRules} from '../../app/starting-money';
import {StartingMoneyField} from '../StartingMoneyField';

type Props={controller:NetworkController;lobby:Lobby;busy:boolean};
/** The parent keys this draft by the host-confirmed lobby id/revision. */
export function LobbyStartingMoney({controller,lobby,busy}:Props){
 const confirmed=confirmedLobbyStartingCredits(lobby),[draft,setDraft]=useState(()=>String(confirmed??STANDARD_STARTING_CREDITS));
 const lock=lobbyStartingMoneyLock(lobby),selection=parseStartingCredits(lock?String(confirmed??STANDARD_STARTING_CREDITS):draft);
 if(hasPrescribedStartingMoney(lobby))return <p className="network-hint">Starting credits are locked. {lock}</p>;
 if(confirmed===undefined)return <p className="network-warning">Starting credits are unavailable. Refresh host rules before editing this operation.</p>;
 return <form className="network-starting-money" onSubmit={event=>{
  event.preventDefault();
  const current=controller.state.get(),active=current.lobby;
  if(current.busy||!active||active.id!==lobby.id||active.revision!==lobby.revision||current.lobbyState!=='forming'||active.host!==current.account?.profile?.id||lobbyStartingMoneyLock(active)||!selection.valid||selection.credits===confirmed)return;
  void controller.changeLobby({rules:startingMoneyRules(selection.credits)});
 }}>
  <StartingMoneyField value={lock?String(confirmed):draft} onChange={setDraft} disabled={busy||!!lock} lockedReason={lock}/>
  <p className="network-hint">{lobby.rules?'Host-confirmed opening: ':'Standard opening while waiting for host rules: '}{formatStartingCredits(confirmed)} credits per commander. Accepted changes are saved in this lobby and clear human commanders' readiness. AI readiness is automatic.</p>
  {!lock&&<button type="submit" disabled={busy||!selection.valid||selection.credits===confirmed}>Apply starting credits</button>}
  {confirmed!==STANDARD_STARTING_CREDITS&&<p className="network-hint">Apply the standard 6,000 credits before making this lobby public.</p>}
 </form>;
}
