import {createRoot} from 'react-dom/client';
import {Application} from './app/application';
import {App} from './ui/App';
import './design/tokens.css';
import './styles/game.css';
const application=new Application();
createRoot(document.getElementById('root')!).render(<App app={application}/>);
void application.boot();
if(import.meta.hot)import.meta.hot.dispose(()=>application.dispose());
