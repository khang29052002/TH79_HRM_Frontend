import {Menu,Search,Sparkles} from 'lucide-react';
import {useAuth} from '../hooks/useAuth';

export default function Header({onCommand,onMenu}){
  const {user}=useAuth();
  const displayName=user?.full_name||user?.username||'Quản trị viên';

  return <header className="topbar base-mobile-topbar">
    <div className="topbar-left">
      <button className="icon-button mobile-menu" type="button" onClick={onMenu} aria-label="Mở menu"><Menu/></button>
      <div className="welcome"><strong>TH79 HRM</strong><small>· {displayName}</small></div>
    </div>
    <div className="topbar-right">
      <button className="global-search global-search-trigger" type="button" onClick={onCommand} aria-label="Tìm kiếm nhanh">
        <span className="command-ai-icon"><Sparkles/></span>
        <span>Tìm nhanh...</span>
        <Search size={15}/>
      </button>
    </div>
  </header>;
}
