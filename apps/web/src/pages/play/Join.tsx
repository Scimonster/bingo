import { useNavigate, useParams } from "react-router-dom";
import { writeLastRound } from "../../components/live/liveUtils";
import { JoinForm, type JoinResult } from "./JoinForm";
import { LangSwitch, PlayerShell, useJoinLang } from "./playerCommon";

export default function Join() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [lang, setLang] = useJoinLang();
  const onJoined = (r: JoinResult) => {
    writeLastRound(localStorage, r.gameId, r.sessionId);
    navigate(`/play/${r.gameId}/${r.sessionId}`, { replace: true });
  };
  return (
    <PlayerShell lang={lang}>
      <LangSwitch onChange={setLang} />
      <div className="pt-6">
        <JoinForm initialCode={code} onJoined={onJoined} />
      </div>
    </PlayerShell>
  );
}
