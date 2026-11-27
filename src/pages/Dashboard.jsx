import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {
  Users,Clock3,Files,Inbox,ChevronRight,
  Building2,CircleCheck,Search,Plus,ArrowRight,AlertTriangle
} from 'lucide-react';
import {api} from '../lib/api';
import {Loading,PageHeader,StatCard,Badge,Empty} from '../components/ui';
import {useAuth} from '../hooks/useAuth';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid} from 'recharts';

function greeting(){
  const h=new Date().getHours();
  if(h<11)return 'Chào buổi sáng';
  if(h<14)return 'Chào buổi trưa';
  if(h<18)return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export default function Dashboard(){
  const [d,setD]=useState(null);
  const nav=useNavigate();
  const {has,user}=useAuth();

  useEffect(()=>{api('/dashboard').then(setD)},[]);
  if(!d)return <Loading/>;

  const s=d.stats||{};
  const smart=d.smartAlerts||{counts:{},items:[],total:0,urgent:0};
  const docs=d.documentProgress||{percent:0,completed:0,missing:0,missingEmployees:0};
  const displayName=user?.full_name||user?.username||'Admin';
  const today=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
  const alertItems=(smart.items||[]).slice(0,8);

  return <div className="dash-page">
    <PageHeader
      title={`${greeting()}, ${displayName}`}
      subtitle={`Tổng quan nhân sự · ${today}`}
      actions={<>
        <button
          type="button"
          className="btn ghost"
          onClick={()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true}))}
        >
          <Search size={15}/> Tìm nhanh (Ctrl K)
        </button>
        {has('employee.create')&&<Link className="btn primary" to="/employees/new"><Plus size={16}/> Thêm nhân viên</Link>}
      </>}
    />

    <div className="stats-grid four dash-kpis">
      <StatCard
        icon={Users}
        label="Tổng nhân sự"
        value={s.total||0}
        detail={`Chính thức: ${s.active||0} · Thử việc: ${s.probation||0}`}
        tone="blue"
      />
      <StatCard
        icon={Clock3}
        label="Chấm công hôm nay"
        value={d.attendanceToday?.checked_in||0}
        detail={`Đi muộn: ${d.attendanceToday?.late||0} lượt`}
        tone="green"
      />
      <StatCard
        icon={Inbox}
        label="Yêu cầu chờ duyệt"
        value={d.pendingSelfService||0}
        detail="Hồ sơ, nghỉ phép & giải trình"
        tone="amber"
      />
      <StatCard
        icon={Files}
        label="Hồ sơ số hóa"
        value={`${docs.percent||0}%`}
        detail={docs.missingEmployees?`Còn thiếu ${docs.missingEmployees} nhân sự`:'Đầy đủ hồ sơ bắt buộc'}
        tone={docs.missingEmployees?'violet':'green'}
      />
    </div>

    <div className="dash-main-grid">
      <section className="card dash-chart-card">
        <div className="card-head">
          <div>
            <h3>Nhân sự theo chi nhánh</h3>
            <p>Phân bổ nhân sự đang làm việc</p>
          </div>
          <Link className="link-btn" to="/employees"><Building2 size={15}/> Danh sách</Link>
        </div>
        <div className="dash-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.branchChart||[]} margin={{top:10,right:12,left:-16,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:12}} axisLine={false} tickLine={false}/>
              <YAxis allowDecimals={false} tick={{fontSize:12}} axisLine={false} tickLine={false}/>
              <Tooltip/>
              <Bar dataKey="value" radius={[6,6,0,0]} fill="#1f74ec"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card dash-alerts-card">
        <div className="card-head">
          <div>
            <h3>Việc cần xử lý</h3>
            <p>{smart.total||0} mục đang theo dõi{smart.urgent>0?` · ${smart.urgent} ưu tiên cao`:''}</p>
          </div>
          {has('employee.update')&&<Link className="link-btn" to="/self-service/requests">Duyệt yêu cầu</Link>}
        </div>
        <div className="dash-alert-list">
          {alertItems.length?alertItems.map((item,i)=><button
            key={`${item.type||'alert'}-${item.employee_id||i}-${i}`}
            type="button"
            className="dash-alert-row"
            onClick={()=>item.href&&nav(item.href)}
          >
            <span className={`dash-alert-dot ${item.severity||'info'}`}><AlertTriangle size={15}/></span>
            <span className="dash-alert-copy">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <ChevronRight size={16}/>
          </button>):<div className="dash-alert-empty">
            <CircleCheck size={28}/>
            <strong>Mọi thứ đang ổn</strong>
            <span>Chưa có cảnh báo nhân sự cần xử lý ngay.</span>
          </div>}
        </div>
      </section>
    </div>

    <section className="card dash-recent-card">
      <div className="card-head">
        <div>
          <h3>Nhân viên mới gần đây</h3>
          <p>Sắp xếp theo ngày nhận việc</p>
        </div>
        <Link className="link-btn" to="/employees">Xem tất cả</Link>
      </div>
      <div className="table-wrap">
        <table className="dash-recent-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Đơn vị &amp; Chức vụ</th>
              <th>Ngày nhận việc</th>
              <th>Trạng thái</th>
              <th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {(d.recentEmployees||[]).map((e,i)=>{
              const empId=e.id||e._id||e.employee_code;
              const ini=String(e.full_name||'?').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase();
              return <tr key={empId||i}>
                <td>
                  <button type="button" className="person-cell person-link" onClick={()=>nav(`/employees/${encodeURIComponent(empId)}`)}>
                    <span className="mini-avatar">{ini}</span>
                    <span><strong>{e.full_name}</strong><small>{e.employee_code}</small></span>
                  </button>
                </td>
                <td><strong>{e.position_name||'—'}</strong><small className="block">{e.branch_name||'Chưa phân chi nhánh'}</small></td>
                <td>{e.join_date?new Date(e.join_date).toLocaleDateString('vi-VN'):'—'}</td>
                <td><Badge value={e.employment_status}/></td>
                <td>
                  <button type="button" className="icon-button small" title="Xem hồ sơ" onClick={()=>nav(`/employees/${encodeURIComponent(empId)}`)}>
                    <ArrowRight size={16}/>
                  </button>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {!(d.recentEmployees||[]).length&&<Empty title="Chưa có nhân viên mới"/>}
      </div>
    </section>
  </div>;
}
