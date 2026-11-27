import {useEffect,useRef,useState} from 'react';
import {NavLink,useLocation,useNavigate} from 'react-router-dom';
import {
  LayoutDashboard,Users,FileSignature,WalletCards,UserSearch,
  GraduationCap,Settings2,UserRound,ClipboardCheck,
  FileBarChart,ChevronDown,ChevronRight,BarChart3,
  ScanFace,CalendarOff,Bell,Search,Moon,Sun,Download,KeyRound,LogOut,
  TriangleAlert,Camera,ShieldCheck,Workflow,ChevronLeft
} from 'lucide-react';
import {useAuth} from '../hooks/useAuth';
import {api} from '../lib/api';
import {initials} from '../lib/format';

const NAV_GROUPS=[
  {
    id:'hr',
    label:'Nhân sự',
    items:[
      {to:'/',label:'Tổng quan',Icon:LayoutDashboard,perm:'dashboard.view',end:true},
      {to:'/employees',label:'Hồ sơ nhân sự',Icon:Users,perm:'employee.view'},
      {to:'/recruitment',label:'Tuyển dụng',Icon:UserSearch,perm:'recruitment.view'}
    ]
  },
  {
    id:'operations',
    label:'Chấm công & Chính sách',
    items:[
      {to:'/attendance',label:'Chấm công',Icon:ScanFace,perm:'attendance.view'},
      {to:'/leave',label:'Nghỉ phép & OT',Icon:CalendarOff,perm:'attendance.view'},
      {to:'/self-service/requests',label:'Duyệt yêu cầu',Icon:ClipboardCheck,perm:'employee.update'},
      {to:'/contracts',label:'Hợp đồng',Icon:FileSignature,perm:'contract.view'},
      {to:'/payroll',label:'Tiền lương',Icon:WalletCards,perm:'payroll.view'}
    ]
  },
  {
    id:'system',
    label:'Báo cáo & Hệ thống',
    items:[
      {to:'/reports',label:'Báo cáo',Icon:FileBarChart,perm:'report.view'},
      {to:'/analytics',label:'People Analytics',Icon:BarChart3,perm:'report.view'},
      {to:'/system',label:'Cấu hình & Phân quyền',Icon:ShieldCheck,perm:'organization.view'}
    ]
  },
  {
    id:'upcoming',
    label:'Tính năng mới',
    defaultCollapsed:true,
    items:[
      {to:'/onboarding',label:'Onboarding',Icon:Workflow,perm:'employee.view',tag:'Mới'},
      {to:'/training',label:'Đào tạo',Icon:GraduationCap,perm:'training.view',tag:'Mới'}
    ]
  }
];

export default function Sidebar({mobileOpen,onMobileClose,onCommand}){
  const {has,user,logout,setUser}=useAuth();
  const nav=useNavigate();
  const location=useLocation();
  const [collapsedGroups,setCollapsedGroups]=useState({upcoming:true});
  const [dark,setDark]=useState(localStorage.getItem('th79_theme')==='dark');
  const [alerts,setAlerts]=useState([]);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [canInstall,setCanInstall]=useState(Boolean(window.__TH79_PWA_INSTALL_PROMPT__));
  const [avatarBroken,setAvatarBroken]=useState(false);
  const fileRef=useRef();
  const notifyRef=useRef();

  useEffect(()=>{
    document.documentElement.dataset.theme=dark?'dark':'light';
    localStorage.setItem('th79_theme',dark?'dark':'light');
  },[dark]);

  useEffect(()=>{api('/dashboard').then(r=>setAlerts(r.alerts||[])).catch(()=>{})},[]);

  useEffect(()=>{
    const ready=()=>setCanInstall(Boolean(window.__TH79_PWA_INSTALL_PROMPT__));
    const installed=()=>setCanInstall(false);
    window.addEventListener('th79-pwa-install-ready',ready);
    window.addEventListener('th79-pwa-installed',installed);
    return()=>{
      window.removeEventListener('th79-pwa-install-ready',ready);
      window.removeEventListener('th79-pwa-installed',installed);
    };
  },[]);

  useEffect(()=>{
    const close=e=>{
      if(notifyRef.current&&!notifyRef.current.contains(e.target)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);

  useEffect(()=>setAvatarBroken(false),[user?.avatar_path,user?.avatar_cloudinary_secure_url,user?.avatar_cloudinary_version]);

  const storedAvatar=user?.avatar_cloudinary_secure_url||user?.avatar_path||'';
  const avatar=!avatarBroken&&/^https?:\/\//i.test(String(storedAvatar))?storedAvatar:null;
  const displayName=user?.full_name||user?.username||'Quản trị viên';

  const upload=async e=>{
    const f=e.target.files?.[0];
    if(!f)return;
    const fd=new FormData();
    fd.append('avatar',f);
    const r=await api('/profile/avatar',{method:'POST',body:fd});
    setAvatarBroken(false);
    setUser({...user,avatar_path:r.avatarUrl,avatar_cloudinary_secure_url:r.avatarUrl,avatar_storage_provider:'cloudinary',avatar_cloudinary_version:r.avatarVersion});
    e.target.value='';
  };

  const installApp=async()=>{
    const prompt=window.__TH79_PWA_INSTALL_PROMPT__;
    if(prompt){
      await prompt.prompt();
      try{await prompt.userChoice;}catch{}
      window.__TH79_PWA_INSTALL_PROMPT__=null;
      setCanInstall(false);
      return;
    }
    if(window.matchMedia?.('(display-mode: standalone)').matches){
      window.alert('TH79 HRM đang chạy ở chế độ ứng dụng desktop.');
      return;
    }
    window.alert('Để cài TH79 HRM trên máy tính, hãy mở bằng Chrome hoặc Microsoft Edge trên localhost/HTTPS, sau đó bấm lại biểu tượng tải xuống.');
  };

  const doLogout=async()=>{await logout();nav('/login')};

  const toggleGroup=id=>setCollapsedGroups(prev=>({...prev,[id]:!prev[id]}));

  const isRouteActive=(to,end)=>{
    if(end)return location.pathname===to;
    return location.pathname===to||location.pathname.startsWith(to+'/');
  };

  return <aside className={`base-sidebar-wrap ${mobileOpen?'mobile-open':''}`}>
    {/* Leftmost Icon Rail */}
    <div className="base-rail">
      <div className="base-rail-top">
        <button className="base-rail-avatar" type="button" title={`${displayName} — Bấm để đổi ảnh đại diện`} onClick={()=>fileRef.current?.click()}>
          {avatar?<img src={avatar} alt={displayName} onError={()=>setAvatarBroken(true)}/>:<span>{initials(displayName)}</span>}
          <em className="base-avatar-cam"><Camera/></em>
        </button>
        <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/>

        <button className={`base-rail-btn ${location.pathname==='/'?'active':''}`} type="button" title="Tổng quan" onClick={()=>{nav('/');onMobileClose?.()}}>
          <LayoutDashboard/>
        </button>

        {has('employee.view')&&<button className={`base-rail-btn ${location.pathname.startsWith('/employees')?'active':''}`} type="button" title="Nhân sự" onClick={()=>{nav('/employees');onMobileClose?.()}}>
          <Users/>
        </button>}

        {has('attendance.view')&&<button className={`base-rail-btn ${location.pathname.startsWith('/attendance')||location.pathname.startsWith('/leave')?'active':''}`} type="button" title="Chấm công & Nghỉ phép" onClick={()=>{nav('/attendance');onMobileClose?.()}}>
          <ScanFace/>
        </button>}

        {has('organization.view')&&<button className={`base-rail-btn ${location.pathname.startsWith('/system')||location.pathname.startsWith('/activity')?'active':''}`} type="button" title="Cấu hình & Hệ thống" onClick={()=>{nav('/system');onMobileClose?.()}}>
          <Settings2/>
        </button>}

        <div className="base-rail-notify" ref={notifyRef}>
          <button className={`base-rail-btn ${notificationsOpen?'active':''}`} type="button" title="Thông báo & Cảnh báo" onClick={()=>setNotificationsOpen(v=>!v)}>
            <Bell/>
            {alerts.length>0&&<span className="base-rail-badge">{alerts.length>99?'99+':alerts.length}</span>}
          </button>
          {notificationsOpen&&<div className="base-notify-popover">
            <div className="notification-head">
              <div><strong>Trung tâm cảnh báo</strong><small>Việc nhân sự cần ưu tiên</small></div>
              <span>{alerts.length}</span>
            </div>
            <div className="notification-list">
              {alerts.length?alerts.slice(0,12).map((a,i)=><button key={`${a.type||'alert'}-${a.employee_id||i}-${i}`} className={`notification-item ${a.severity||'info'}`} onClick={()=>{setNotificationsOpen(false);onMobileClose?.();a.href&&nav(a.href)}}>
                <span className="notification-icon"><TriangleAlert/></span>
                <span><strong>{a.title}</strong><small>{a.detail}</small></span>
              </button>):<div className="notification-empty"><Bell/><strong>Không có cảnh báo mới</strong><small>Mọi dữ liệu đang ổn định.</small></div>}
            </div>
          </div>}
        </div>

        <button className="base-rail-btn" type="button" title="Tìm kiếm nhanh (Ctrl+K)" onClick={()=>{onMobileClose?.();onCommand?.()}}>
          <Search/>
        </button>
      </div>

      <div className="base-rail-bottom">
        <button className="base-rail-btn" type="button" title={dark?'Chế độ sáng':'Chế độ tối'} onClick={()=>setDark(v=>!v)}>
          {dark?<Sun/>:<Moon/>}
        </button>
        {canInstall&&<button className="base-rail-btn install-ready" type="button" title="Cài ứng dụng desktop" onClick={installApp}>
          <Download/>
        </button>}
        <button className={`base-rail-btn ${location.pathname==='/change-password'?'active':''}`} type="button" title="Đổi mật khẩu" onClick={()=>{nav('/change-password');onMobileClose?.()}}>
          <KeyRound/>
        </button>
        <button className="base-rail-btn danger" type="button" title="Đăng xuất" onClick={doLogout}>
          <LogOut/>
        </button>
      </div>
    </div>

    {/* Secondary Dark-Blue Sub-Sidebar */}
    <div className="base-subnav">
      <div className="base-subnav-head">
        <NavLink className="base-subnav-title" to="/" onClick={onMobileClose}>
          <ChevronLeft/>
          <div>
            <strong>TH79 HRM</strong>
            <small>{displayName}</small>
          </div>
        </NavLink>
      </div>

      <div className="base-subnav-scroll">
        {NAV_GROUPS.map(group=>{
          const visibleItems=group.items.filter(item=>!item.perm||has(item.perm));
          if(!visibleItems.length)return null;
          const isCollapsed=Boolean(collapsedGroups[group.id]);
          return <div className="base-nav-group" key={group.id}>
            <button className="base-nav-group-btn" type="button" onClick={()=>toggleGroup(group.id)}>
              <span>{group.label}</span>
              {isCollapsed?<ChevronRight/>:<ChevronDown/>}
            </button>
            {!isCollapsed&&<nav className="base-nav-list">
              {visibleItems.map(item=>{
                const Icon=item.Icon;
                const active=isRouteActive(item.to,item.end);
                return <NavLink
                  key={item.to}
                  to={item.to}
                  className={`base-nav-item ${active?'active':''}`}
                  onClick={onMobileClose}
                >
                  <Icon/>
                  <span>{item.label}</span>
                  {item.tag&&<em className="base-nav-tag">{item.tag}</em>}
                </NavLink>;
              })}
            </nav>}
          </div>;
        })}
      </div>

      {user?.employee_id&&<div className="base-subnav-footer">
        <NavLink className={`base-self-link ${location.pathname==='/me'?'active':''}`} to="/me" onClick={onMobileClose}>
          <UserRound/>
          <div>
            <strong>Cổng cá nhân</strong>
            <small>Hồ sơ & yêu cầu của tôi</small>
          </div>
        </NavLink>
      </div>}
    </div>
  </aside>;
}
