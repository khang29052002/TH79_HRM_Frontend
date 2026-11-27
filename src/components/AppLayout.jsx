import {useEffect, useState} from 'react';
import {Navigate, Outlet, useLocation} from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import CommandPalette from './CommandPalette';
import Copilot from './Copilot';
import MobileBottomNav from './MobileBottomNav';
import {useAuth} from '../hooks/useAuth';
import {Loading} from './ui';

export default function AppLayout(){
  const {user,loading}=useAuth();
  const location=useLocation();
  const [commandOpen,setCommandOpen]=useState(false);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);

  useEffect(()=>{
    const onKey=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
        e.preventDefault();
        setCommandOpen(true);
      }
      if(e.key==='Escape'){
        setCommandOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[]);

  if(loading) return <Loading/>;
  if(!user) return <Navigate to="/login" replace/>;
  if(user.must_change_password&&location.pathname!=='/change-password') return <Navigate to="/change-password" replace/>;

  return <div className="app-shell php-ui-shell base-ui-shell">
    <Sidebar mobileOpen={mobileNavOpen} onMobileClose={()=>setMobileNavOpen(false)} onCommand={()=>setCommandOpen(true)}/>
    {mobileNavOpen&&<button className="sidebar-backdrop" aria-label="Đóng menu" onClick={()=>setMobileNavOpen(false)}/>}
    <main className="main-area base-main-area">
      <Header onCommand={()=>setCommandOpen(true)} onMenu={()=>setMobileNavOpen(true)}/>
      <div className="page-wrap base-page-wrap"><Outlet/></div>
    </main>
    <CommandPalette open={commandOpen} onClose={()=>setCommandOpen(false)}/>
    <Copilot/>
    <MobileBottomNav/>
  </div>;
}
