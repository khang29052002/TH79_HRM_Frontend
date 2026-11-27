import {forwardRef,useEffect,useMemo,useRef,useState} from 'react';
import {Calculator,CalendarDays,Download,Eye,FileText,Plus,RefreshCw,Save,Search,Settings2,UsersRound,WalletCards,X} from 'lucide-react';
import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';
import {api} from '../lib/api';
import {Loading,PageHeader,Badge,Modal,Empty,Toast} from '../components/ui';
import {money} from '../lib/format';
import {useAuth} from '../hooks/useAuth';
import {isValidNumber} from '../lib/validation';

const LEGAL_DEFAULTS_2026={
  effective_year:2026,
  effective_from:'2026-01-01',
  version:'LEGAL-2026-v1',
  bhxh_employee_rate:8,
  bhyt_employee_rate:1.5,
  bhtn_employee_rate:1,
  personal_deduction:15500000,
  dependent_deduction:6200000,
  pit_brackets:[
    {up_to:10000000,rate:5},
    {up_to:30000000,rate:10},
    {up_to:60000000,rate:20},
    {up_to:100000000,rate:30},
    {up_to:null,rate:35}
  ]
};

export default function Payroll(){
  const {has,user}=useAuth();
  const canViewSensitive=has('employee.sensitive.view');
  const canEditSettings=Boolean(user?.isSuperAdmin);
  const [summary,setSummary]=useState(null);
  const [activeId,setActiveId]=useState('');
  const [detail,setDetail]=useState(null);
  const [openPeriod,setOpenPeriod]=useState(false);
  const [openSettings,setOpenSettings]=useState(false);
  const [payslip,setPayslip]=useState(null);
  const [editItem,setEditItem]=useState(null);
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState(null);
  const [query,setQuery]=useState('');
  const [modeFilter,setModeFilter]=useState('all');

  const notify=(message,tone='success')=>setToast({message,tone,key:Date.now()});
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),3600);return()=>clearTimeout(t)},[toast]);

  const loadSummary=async(selectNewest=false)=>{
    const r=await api('/payroll');setSummary(r);
    if(selectNewest||!activeId){const first=(r.periods||[])[0];if(first)setActiveId(periodKey(first))}
  };
  useEffect(()=>{loadSummary(true).catch(e=>notify(e.message,'error'))},[]);
  useEffect(()=>{
    if(!activeId){setDetail(null);return}
    let active=true;
    setDetail(null);
    fetchPayrollDetail(activeId,canViewSensitive).then(({detail:r,lookupFailures})=>{
      if(!active)return;
      setDetail(r);
      if(lookupFailures)notify(`Không tải được thông tin bổ sung của ${lookupFailures} nhân viên.`,'error');
    }).catch(e=>active&&notify(e.message,'error'));
    return()=>{active=false};
  },[activeId,canViewSensitive]);

  const reloadDetail=async()=>{if(!activeId)return;const {detail:r,lookupFailures}=await fetchPayrollDetail(activeId,canViewSensitive);setDetail(r);if(lookupFailures)notify(`Không tải được thông tin bổ sung của ${lookupFailures} nhân viên.`,'error');await loadSummary(false)};
  const periods=summary?.periods||[];
  const period=detail?.period;
  const items=detail?.items||[];
  const filteredItems=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return items.filter(item=>{
      const e=item.employee||{};
      const isManual=Boolean(item.manual_deductions)||manualDeductionFields(item).length>0;
      if(modeFilter==='manual'&&!isManual)return false;
      if(modeFilter==='auto'&&isManual)return false;
      if(!q)return true;
      return `${e.full_name||''} ${e.employee_code||''} ${e.position_name||''}`.toLowerCase().includes(q);
    });
  },[items,query,modeFilter]);

  const saveItem=async(item,patch)=>{
    const id=item.manage_id||item.id;
    if(!id)return notify('Dòng lương chưa có định danh hợp lệ.','error');
    try{
      const r=await api(`/payroll/periods/${encodeURIComponent(activeId)}/items/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(patch)});
      const changedManualFields=DEDUCTION_FIELDS.filter(field=>Object.prototype.hasOwnProperty.call(patch,field)&&Number(patch[field]||0)!==Number(item[field]||0));
      const hasServerFieldMetadata=['manual_deduction_fields','manually_edited_fields','manual_fields'].some(field=>Array.isArray(r.item?.[field])||(r.item?.[field]&&typeof r.item[field]==='object'));
      const manualFields=hasServerFieldMetadata?manualDeductionFields(r.item):[...new Set([...manualDeductionFields(item),...changedManualFields])];
      const savedItem=patch.force_auto
        ?{...r.item,manual_deductions:false,manual_deduction_fields:[],manually_edited_fields:[],manual_fields:[]}
        :changedManualFields.length||manualFields.length
          ?{...r.item,manual_deductions:Boolean(r.item?.manual_deductions||manualFields.length),manual_deduction_fields:manualFields}
          :r.item;
      setDetail(d=>{
        const nextItems=(d?.items||[]).map(x=>(x.manage_id||x.id)===(item.manage_id||item.id)?{...x,...savedItem,employee:x.employee}:x);
        const totals=nextItems.reduce((a,x)=>{a.gross+=Number(x.gross_salary)||0;a.deduction+=Number(x.total_deduction)||0;a.net+=Number(x.net_salary)||0;return a},{gross:0,deduction:0,net:0});
        return {...d,items:nextItems,period:{...d.period,total_employee:nextItems.length,total_gross:totals.gross,total_deduction:totals.deduction,total_net:totals.net}};
      });
      loadSummary(false).catch(()=>{});
      return true;
    }catch(e){notify(e.message,'error');reloadDetail().catch(()=>{});return false}
  };
  const localPatch=(item,patch)=>setDetail(d=>({...d,items:(d.items||[]).map(x=>(x.manage_id||x.id)===(item.manage_id||item.id)?{...x,...patch}:x)}));

  const syncEmployees=async()=>{setBusy(true);try{const r=await api(`/payroll/periods/${encodeURIComponent(activeId)}/sync-employees`,{method:'POST'});notify(r.message);await reloadDetail()}catch(e){notify(e.message,'error')}finally{setBusy(false)}};
  const syncAttendance=async()=>{setBusy(true);try{const r=await api(`/payroll/periods/${encodeURIComponent(activeId)}/sync-attendance`,{method:'POST'});notify(r.message);await reloadDetail()}catch(e){notify(e.message,'error')}finally{setBusy(false)}};
  const recalculate=async()=>{setBusy(true);try{const r=await api(`/payroll/periods/${encodeURIComponent(activeId)}/recalculate`,{method:'POST'});notify(r.message);await reloadDetail()}catch(e){notify(e.message,'error')}finally{setBusy(false)}};
  const openPayslip=async item=>{
    try{
      const id=item.manage_id||item.id;
      const r=await api(`/payroll/periods/${encodeURIComponent(activeId)}/items/${encodeURIComponent(id)}/payslip`);
      setPayslip({
        ...r,
        employee:{...r.employee,...item.employee},
        item:{...r.item,...item},
        period:{...r.period,...detail?.period}
      });
    }catch(e){notify(e.message,'error')}
  };

  if(!summary)return <Loading/>;
  const settingsSnapshot=normalizeSettings(period?.settings_snapshot||period?.payroll_settings_snapshot||detail?.settings_snapshot||detail?.settings);
  const settingVersions=Array.isArray(detail?.settings_versions)?detail.settings_versions:Array.isArray(detail?.settings_history)?detail.settings_history:[];

  return <>
    {toast&&<Toast key={toast.key} message={toast.message} tone={toast.tone} onClose={()=>setToast(null)}/>}    
    <PageHeader title="Bảng lương & phiếu lương" subtitle="Tự động lấy nhân sự và cấu hình lương, kế toán nhập ngày công rồi hệ thống tính gross, khấu trừ và thực lãnh." actions={<>
      {(has('payroll.view')||has('payroll.manage'))&&<button className="btn ghost" onClick={()=>setOpenSettings(true)}><Settings2/> Mặc định pháp lý 2026</button>}
      {has('payroll.manage')&&<button className="btn primary" onClick={()=>setOpenPeriod(true)}><Plus/> Tạo kỳ lương</button>}
    </>}/>

    <section className="payroll-period-strip">
      {periods.map(p=><button key={periodKey(p)} className={`payroll-period-card ${String(activeId)===String(periodKey(p))?'active':''}`} onClick={()=>setActiveId(periodKey(p))}>
        <span><CalendarDays/></span><div><strong>{p.salary_name||`Bảng lương ${p.salary_month}/${p.salary_year}`}</strong><small>{p.salary_code||''}</small></div><em>{p.total_employee||0} NV</em>
      </button>)}
      {!periods.length&&<div className="card payroll-empty-period"><WalletCards/><div><strong>Chưa có kỳ lương</strong><span>Tạo kỳ lương mới để hệ thống tự nạp danh sách nhân sự.</span></div></div>}
    </section>

    {period&&<>
      <section className="payroll-summary-grid">
        <PayrollStat label="Nhân sự" value={items.length} icon={UsersRound}/>
        <PayrollStat label="Tổng Gross" value={money(period.total_gross)} icon={WalletCards}/>
        <PayrollStat label="Khấu trừ" value={money(period.total_deduction)} icon={Calculator}/>
        <PayrollStat label="Thực lãnh" value={money(period.total_net)} icon={Save}/>
      </section>

      <section className="card payroll-workspace">
        <div className="card-head payroll-workspace-head"><div><h3>{period.salary_name}</h3><p>Công chuẩn {period.standard_work_days||26} ngày · khoản khấu trừ tự lưu khi rời ô.</p></div><div className="payroll-tools">
          <span className="internal-data">{settingsSnapshot.version||'Mặc định pháp lý 2026'}</span>
          {has('payroll.manage')&&<button className="btn ghost small" disabled={busy} onClick={syncEmployees}><UsersRound/> Đồng bộ nhân sự</button>}
          {has('payroll.manage')&&<button className="btn ghost small" disabled={busy} onClick={syncAttendance}><CalendarDays/> Đồng bộ công &amp; OT</button>}
          {has('payroll.manage')&&<button className="btn primary small" disabled={busy} onClick={recalculate}><RefreshCw/> Tính lại theo quy định</button>}
        </div></div>

        <div className="payroll-filterbar">
          <label className="search-box"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm nhân viên theo tên, mã NV, chức vụ..."/></label>
          <select value={modeFilter} onChange={e=>setModeFilter(e.target.value)}>
            <option value="all">Tất cả chế độ khấu trừ ({items.length})</option>
            <option value="auto">Khấu trừ tự động</option>
            <option value="manual">Đã chỉnh tay</option>
          </select>
          <span className="payroll-filter-count">Hiển thị {filteredItems.length}/{items.length} nhân sự</span>
        </div>

        <div className="payroll-policy-note"><Settings2/><span><strong>Khấu trừ tự động:</strong> BHXH {settingsSnapshot.bhxh_employee_rate}% · BHYT {settingsSnapshot.bhyt_employee_rate}% · BHTN {settingsSnapshot.bhtn_employee_rate}% · giảm trừ bản thân {money(settingsSnapshot.personal_deduction)} · người phụ thuộc {money(settingsSnapshot.dependent_deduction)}.</span></div>

        <div className="table-wrap payroll-table-wrap"><table className="payroll-detail-table">
          <thead><tr><th>Nhân viên</th><th>Lương áp dụng</th><th>Ngày công</th><th>Thu nhập (Gross)</th><th>Khấu trừ</th><th>Thực lãnh</th><th className="actions-col">Thao tác</th></tr></thead>
          <tbody>{filteredItems.map(item=><PayrollRow key={item.manage_id||item.id} item={item} canEdit={has('payroll.manage')} canViewSensitive={canViewSensitive} localPatch={patch=>localPatch(item,patch)} save={patch=>saveItem(item,patch)} openPayslip={()=>openPayslip(item)} openEditor={()=>setEditItem(item)}/>)}</tbody>
        </table>{!filteredItems.length&&<Empty title={items.length?'Không tìm thấy nhân viên phù hợp':'Kỳ lương chưa có nhân viên'} detail={items.length?'Thử xóa từ khóa tìm kiếm hoặc đổi bộ lọc.':'Bấm Đồng bộ nhân sự để nạp danh sách hiện tại.'}/>}</div>
      </section>
    </>}

    <Modal open={openPeriod} onClose={()=>setOpenPeriod(false)} title="Tạo kỳ lương"><PeriodForm initialSettings={normalizeSettings(detail?.settings)} done={async id=>{setOpenPeriod(false);if(!id)return;await loadSummary(false);setActiveId(String(id));notify('Đã tạo kỳ lương và tự nạp nhân sự.')}} onCancel={()=>setOpenPeriod(false)}/></Modal>
    <Modal open={openSettings} onClose={()=>setOpenSettings(false)} title="Mặc định pháp lý 2026" wide><SettingsForm initial={detail?.settings||LEGAL_DEFAULTS_2026} versions={settingVersions} canEdit={canEditSettings} done={async()=>{setOpenSettings(false);notify('Đã lưu phiên bản cấu hình.');if(activeId)await reloadDetail()}} onCancel={()=>setOpenSettings(false)}/></Modal>
    <Modal open={Boolean(editItem)} onClose={()=>setEditItem(null)} title={`Chi tiết lương — ${editItem?.employee?.full_name||''}`} wide>
      {editItem&&<PayrollItemForm item={editItem} onCancel={()=>setEditItem(null)} done={async patch=>{const ok=await saveItem(editItem,patch);if(ok){setEditItem(null);notify('Đã cập nhật chi tiết lương.')}}}/>}
    </Modal>
    <PayslipModal data={payslip} onClose={()=>setPayslip(null)} notify={notify}/>
  </>;
}

function PayrollRow({item,canEdit,canViewSensitive,localPatch,save,openPayslip,openEditor}){
  const e=item.employee||{};
  const age=canViewSensitive?employeeAge(e.date_of_birth):null;
  const manualFields=manualDeductionFields(item);
  const isManual=Boolean(item.manual_deductions)||manualFields.length>0;
  const num=(field,value)=>{localPatch({[field]:value});};
  const commit=(field,value)=>save({[field]:Number(value)||0});
  const totalInsurance=(Number(item.social_insurance_employee)||0)+(Number(item.health_insurance_employee)||0)+(Number(item.unemployment_insurance_employee)||0);
  return <tr className={isManual?'manual-deduction-row':''}>
    <td className="payroll-person">
      <strong>{e.full_name||`NV #${item.employee_id}`}</strong>
      <small>{e.employee_code||''}{age!==null?` · ${age} tuổi`:''}{e.position_name?` · ${e.position_name}`:''}</small>
      <div className="payroll-row-badges"><Badge value={e.employment_status}/><span className={`payroll-mode-badge ${isManual?'manual':'automatic'}`}>{isManual?'Chỉnh tay':'Tự động'}</span></div>
    </td>
    <td className="money-cell applied"><strong>{money(item.applied_salary)}</strong><small className="block">{e.employment_status==='probation'?`Thử việc · Chính thức: ${money(item.base_salary)}`:'Lương chính thức'}</small></td>
    <td className="payroll-days-cell">{canEdit?<div className="payroll-days-inline"><input className="payroll-number days" type="number" min="0" step="0.5" value={item.actual_work_days??0} onChange={e=>num('actual_work_days',e.target.value)} onBlur={e=>commit('actual_work_days',e.target.value)}/><span>/ {item.standard_work_days||26}</span></div>:<span>{item.actual_work_days} / {item.standard_work_days||26}</span>}</td>
    <td className="money-cell gross"><strong>{money(item.gross_salary)}</strong><small className="block">Công: {money(item.salary_by_work_days)} · PC: {money(item.allowance_total)}</small></td>
    <td className="money-cell">
      <strong>{money(item.total_deduction)}</strong>
      <small className="block">BH: {money(totalInsurance)} · TNCN: {money(item.personal_income_tax)}</small>
    </td>
    <td className="money-cell net"><strong>{money(item.net_salary)}</strong></td>
    <td><div className="row-actions">{canEdit&&<button type="button" className="icon-button small" title="Chỉnh chi tiết lương, khấu trừ, OT, thưởng" aria-label="Chỉnh chi tiết lương, khấu trừ, OT, thưởng" onClick={openEditor}><Calculator/></button>}<button type="button" className="icon-button small" title="Xem phiếu lương & tải PDF" aria-label="Xem phiếu lương & tải PDF" onClick={openPayslip}><Eye/></button>{canEdit&&isManual&&<button type="button" className="icon-button small" title="Khôi phục tự động" aria-label="Khôi phục tự động" onClick={()=>save({force_auto:true,manual_deductions:false})}><RefreshCw/></button>}</div></td>
  </tr>;
}

const DEDUCTION_FIELDS=['social_insurance_employee','health_insurance_employee','unemployment_insurance_employee','personal_income_tax','other_deduction'];
function manualDeductionFields(item){
  const explicit=item.manual_deduction_fields||item.manually_edited_fields||item.manual_fields;
  if(Array.isArray(explicit))return explicit.filter(field=>DEDUCTION_FIELDS.includes(field));
  if(explicit&&typeof explicit==='object')return DEDUCTION_FIELDS.filter(field=>explicit[field]);
  return item.manual_deductions?DEDUCTION_FIELDS:[];
}

function PayrollDeductionInput({item,field,manuallyEdited,save}){
  const [value,setValue]=useState(item[field]??0);
  const [error,setError]=useState('');
  useEffect(()=>{setValue(item[field]??0);setError('')},[item[field]]);
  const change=next=>{
    const amount=Number(next)||0;
    const current=Number(item[field])||0;
    const gross=Math.max(0,Number(item.gross_salary)||0);
    const otherDeductions=DEDUCTION_FIELDS.reduce((sum,key)=>sum+(key===field?0:Number(item[key])||0),0);
    if(amount>gross&&amount>current){setValue(next);setError(`Không được vượt Gross (${money(gross)}).`);return}
    if(amount+otherDeductions>gross&&amount>current){setValue(next);setError(`Tổng khấu trừ vượt Gross (${money(gross)}).`);return}
    setValue(next);
    setError('');
  };

  const blur=async()=>{
    if(error)return;
    const amount=Number(value)||0;
    const current=Number(item[field])||0;
    const gross=Math.max(0,Number(item.gross_salary)||0);
    const otherDeductions=DEDUCTION_FIELDS.reduce((sum,key)=>sum+(key===field?0:Number(item[key])||0),0);
    if(amount===current){setError('');return}
    if(amount>gross&&amount>current){
      setError(`Không được vượt Gross (${money(gross)}).`);
      return;
    }
    if(amount+otherDeductions>gross&&amount>current){
      setError(`Tổng khấu trừ vượt Gross (${money(gross)}).`);
      return;
    }
    if(!await save({[field]:amount})){
      setError('Lưu thất bại. Kiểm tra thông báo rồi thử lại.');
      return;
    }
    setValue(amount);
    setError('');
  };
  const errorId=`deduction-error-${String(item.manage_id||item.id||item.employee_id)}-${field}`;
  return <div className="payroll-money-input-wrap">
    <FormattedMoneyInput
      className={`payroll-number deduction ${manuallyEdited?'manually-edited':''}`}
      value={value}
      onChange={change}
      onNegative={()=>setError('Không cho phép số âm.')}
      onBlur={blur}
      aria-invalid={Boolean(error)}
      aria-describedby={error?errorId:undefined}
      aria-label={DEDUCTION_LABELS[field]}
    />
    {error&&<small className="payroll-input-error" id={errorId} role="alert">{error}</small>}
  </div>;
}

const DEDUCTION_LABELS={
  social_insurance_employee:'BHXH',
  health_insurance_employee:'BHYT',
  unemployment_insurance_employee:'BHTN',
  personal_income_tax:'TNCN',
  other_deduction:'Khấu trừ khác'
};

function FormattedMoneyInput({value,onChange,onNegative,onBlur,...props}){
  const handleChange=e=>{
    const raw=e.target.value;
    if(/[-−]/.test(raw)){onNegative?.();return}
    const caret=e.target.selectionStart??raw.length;
    const digitsBefore=raw.slice(0,caret).replace(/\D/g,'').length;
    const digits=raw.replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    onChange(digits?Number(digits):'');
    const formatted=formatMoneyDigits(digits);
    requestAnimationFrame(()=>{
      if(document.activeElement!==e.target)return;
      let seen=0,pos=0;
      for(let index=0;index<formatted.length;index++){
        if(/\d/.test(formatted[index]))seen++;
        if(seen===digitsBefore){pos=index+1;break}
      }
      e.target.setSelectionRange(pos,pos);
    });
  };
  return <span className="payroll-currency-entry">
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatMoneyDigits(value)}
      onChange={handleChange}
      onBlur={onBlur}
    />
    <span aria-hidden="true">₫</span>
  </span>;
}

function formatMoneyDigits(value){
  const digits=String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}

function PayrollItemForm({item,done,onCancel}){
  const [f,setF]=useState({
    actual_work_days:item.actual_work_days??0,
    allowance_total:item.allowance_total??0,
    overtime_hours:item.overtime_hours??0,
    overtime_pay:item.overtime_pay??0,
    bonus:item.bonus??0,
    other_income:item.other_income??0,
    tax_dependents:item.tax_dependents??0,
    social_insurance_employee:item.social_insurance_employee??0,
    health_insurance_employee:item.health_insurance_employee??0,
    unemployment_insurance_employee:item.unemployment_insurance_employee??0,
    personal_income_tax:item.personal_income_tax??0,
    other_deduction:item.other_deduction??0,
    note:item.note||''
  });
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const setDeduction=(field,value)=>{
    const amount=Number(value)||0;
    const current=Number(f[field])||0;
    const gross=Math.max(0,Number(item.gross_salary)||0);
    const total=DEDUCTION_FIELDS.reduce((sum,key)=>sum+(key===field?amount:Number(f[key])||0),0);
    if(amount>gross&&amount>current){setError(`${DEDUCTION_LABELS[field]} không được vượt Gross (${money(gross)}).`);return}
    if(total>gross&&amount>current){setError(`Tổng khấu trừ không được vượt Gross (${money(gross)}).`);return}
    set(field,value);
    setError('');
  };
  const submit=async e=>{
    e.preventDefault();
    if(error)return;
    for(const field of ['actual_work_days','allowance_total','overtime_hours','overtime_pay','bonus','other_income','social_insurance_employee','health_insurance_employee','unemployment_insurance_employee','personal_income_tax','other_deduction']){
      if(!isValidNumber(f[field],{min:0,max:1_000_000_000_000})){setError('Ngày công, giờ OT, thu nhập và khấu trừ phải là số không âm hợp lệ.');return}
    }
    if(Number(f.actual_work_days)*2%1!==0||Number(f.actual_work_days)>Number(item.standard_work_days||26)*2){setError('Ngày công phải theo bước 0,5 và không vượt quá 2 lần công chuẩn.');return}
    if(Number(f.overtime_hours)*2%1!==0){setError('Giờ OT phải theo bước 0,5 giờ.');return}
    if(!isValidNumber(f.tax_dependents,{min:0,max:100,integer:true})){setError('Số người phụ thuộc phải là số nguyên từ 0 đến 100.');return}
    const gross=Math.max(0,Number(item.gross_salary)||0);
    const totalDeduction=DEDUCTION_FIELDS.reduce((sum,field)=>sum+(Number(f[field])||0),0);
    const exceedsGross=DEDUCTION_FIELDS.find(field=>(Number(f[field])||0)>gross);
    if(exceedsGross){setError(`${DEDUCTION_LABELS[exceedsGross]} không được vượt Gross (${money(gross)}).`);return}
    if(totalDeduction>gross){setError(`Tổng khấu trừ (${money(totalDeduction)}) không được vượt Gross (${money(gross)}).`);return}
    setError('');setBusy(true);try{await done(f)}finally{setBusy(false)}
  };
  const standardDays=Math.max(1,Number(item.standard_work_days)||26);
  const salaryByDays=Math.round((Number(item.applied_salary)||0)*(Number(f.actual_work_days)||0)/standardDays);
  const previewGross=salaryByDays+(Number(f.allowance_total)||0)+(Number(f.overtime_pay)||0)+(Number(f.bonus)||0)+(Number(f.other_income)||0);
  const previewDeduction=DEDUCTION_FIELDS.reduce((sum,key)=>sum+(Number(f[key])||0),0);
  const previewNet=Math.max(0,previewGross-previewDeduction);

  return <form className="form-stack payroll-item-editor" onSubmit={submit}>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <div className="pe-header-card">
      <div className="pe-emp">
        <span className="pe-avatar"><Calculator size={18}/></span>
        <div>
          <strong>{item.employee?.full_name||`NV #${item.employee_id}`}</strong>
          <small>{item.employee?.employee_code||''} · Mức áp dụng: {money(item.applied_salary)} / {standardDays} công</small>
        </div>
      </div>
      <div className="pe-live-kpis">
        <div><small>Gross tạm tính</small><strong>{money(previewGross)}</strong></div>
        <div><small>Tổng khấu trừ</small><strong className="ded">{money(previewDeduction)}</strong></div>
        <div className="net-pill"><small>Thực lãnh tạm tính</small><strong>{money(previewNet)}</strong></div>
      </div>
    </div>

    <div className="pe-grid">
      <section className="pe-section">
        <div className="pe-section-head">
          <h4>Công &amp; Thu nhập</h4>
          <small>Lương theo công tạm tính: {money(salaryByDays)}</small>
        </div>
        <div className="pe-fields-grid">
          <label>Ngày công thực tế<input type="number" min="0" step="0.5" value={f.actual_work_days} onChange={e=>set('actual_work_days',e.target.value)}/></label>
          <label>Phụ cấp kỳ này<FormattedMoneyInput value={f.allowance_total} onChange={v=>set('allowance_total',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
          <label>Số người phụ thuộc<input type="number" min="0" step="1" value={f.tax_dependents} onChange={e=>set('tax_dependents',e.target.value)}/></label>
          <label>Giờ tăng ca (OT)<input type="number" min="0" step="0.5" value={f.overtime_hours} onChange={e=>set('overtime_hours',e.target.value)}/></label>
          <label>Tiền tăng ca (OT)<FormattedMoneyInput value={f.overtime_pay} onChange={v=>set('overtime_pay',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
          <label>Thưởng<FormattedMoneyInput value={f.bonus} onChange={v=>set('bonus',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
          <label>Thu nhập khác<FormattedMoneyInput value={f.other_income} onChange={v=>set('other_income',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
        </div>
      </section>

      <section className="pe-section">
        <div className="pe-section-head">
          <h4>Khấu trừ (Chỉnh tay)</h4>
          <small>Chuyển sang thủ công khi sửa trực tiếp</small>
        </div>
        <div className="pe-fields-grid">
          <label>BHXH<FormattedMoneyInput value={f.social_insurance_employee} onChange={v=>setDeduction('social_insurance_employee',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
          <label>BHYT<FormattedMoneyInput value={f.health_insurance_employee} onChange={v=>setDeduction('health_insurance_employee',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
          <label>BHTN<FormattedMoneyInput value={f.unemployment_insurance_employee} onChange={v=>setDeduction('unemployment_insurance_employee',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
          <label>Thuế TNCN<FormattedMoneyInput value={f.personal_income_tax} onChange={v=>setDeduction('personal_income_tax',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
          <label>Khấu trừ khác<FormattedMoneyInput value={f.other_deduction} onChange={v=>setDeduction('other_deduction',v)} onNegative={()=>setError('Không cho phép số âm.')}/></label>
        </div>
      </section>
    </div>

    <label className="pe-note-field"><span>Ghi chú kỳ lương</span><textarea rows="2" value={f.note} onChange={e=>set('note',e.target.value)} placeholder="Ghi chú kỳ lương, truy thu, nghỉ không lương..."/></label>
    <div className="modal-actions"><button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Hủy</button><button className="btn primary" disabled={busy}><Save/> {busy?'Đang lưu...':'Lưu & tính lại'}</button></div>
  </form>;
}

function PayrollStat({label,value,icon:Icon}){return <div className="card payroll-stat"><span><Icon/></span><div><small>{label}</small><strong>{value}</strong></div></div>}

function PeriodForm({initialSettings,done,onCancel}){
  const now=new Date();
  const [f,setF]=useState({month:now.getMonth()+1,year:now.getFullYear(),name:'',salary_code:'',standard_work_days:26,status:'draft',note:''});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async e=>{
    e.preventDefault();setError('');
    if(!isValidNumber(f.month,{min:1,max:12,integer:true})){setError('Tháng kỳ lương phải là số nguyên từ 1 đến 12.');return}
    if(!isValidNumber(f.year,{min:2000,max:2200,integer:true})){setError('Năm kỳ lương phải là số nguyên từ 2000 đến 2200.');return}
    if(!isValidNumber(f.standard_work_days,{min:1,max:31})||Number(f.standard_work_days)*2%1!==0){setError('Công chuẩn phải từ 1 đến 31 ngày và theo bước 0,5.');return}
    setBusy(true);try{const r=await api('/payroll/periods',{method:'POST',body:JSON.stringify({...f,settings_snapshot:initialSettings})});done(r.id)}catch(e){setError(e.message)}finally{setBusy(false)}
  };
  return <form className="form-stack modal-form" onSubmit={submit}>{error&&<div className="form-error">{error}</div>}<div className="two-col"><label>Tháng<input type="number" min="1" max="12" step="1" required value={f.month} onChange={e=>setF({...f,month:e.target.value})}/></label><label>Năm<input type="number" min="2000" max="2200" step="1" required value={f.year} onChange={e=>setF({...f,year:e.target.value})}/></label></div><label>Tên kỳ lương<input maxLength="120" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder={`Bảng lương ${f.month}/${f.year}`}/></label><div className="two-col"><label>Mã kỳ lương<input maxLength="40" value={f.salary_code} onChange={e=>setF({...f,salary_code:e.target.value})}/></label><label>Công chuẩn<input type="number" min="1" max="31" step="0.5" required value={f.standard_work_days} onChange={e=>setF({...f,standard_work_days:e.target.value})}/></label></div><label>Ghi chú<textarea rows="3" maxLength="2000" value={f.note} onChange={e=>setF({...f,note:e.target.value})}/></label><div className="modal-actions"><button type="button" className="btn" onClick={onCancel} disabled={busy}>Hủy</button><button className="btn primary" disabled={busy}><Plus/> {busy?'Đang tạo...':'Tạo & nạp nhân sự'}</button></div></form>;
}

function SettingsForm({initial,versions,canEdit,done,onCancel}){
  const [f,setF]=useState(()=>normalizeSettings(initial));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const save=async e=>{e.preventDefault();setBusy(true);setError('');try{await api('/payroll/settings',{method:'PUT',body:JSON.stringify(f)});done()}catch(e){setError(e.message)}finally{setBusy(false)}};
  const history=[...(Array.isArray(versions)?versions:[]).filter(item=>item.version!==f.version),f];
  return <form className="form-stack payroll-settings-form" onSubmit={save}>
    {error&&<div className="form-error">{error}</div>}
    <div className="payroll-settings-note"><Settings2/><span>Tham số được xác định theo ngày hiệu lực và phiên bản. Kỳ lương mới nhận snapshot cấu hình tại thời điểm tạo; kỳ cũ tiếp tục dùng snapshot đã lưu.</span></div>
    <div className="two-col"><label>Phiên bản<input required value={f.version} disabled={!canEdit} onChange={e=>set('version',e.target.value)}/></label><label>Ngày hiệu lực<input required type="date" value={f.effective_from} disabled={!canEdit} onChange={e=>set('effective_from',e.target.value)}/></label></div>
    <div className="three-col"><label>BHXH người lao động (%)<input type="number" min="0" step="0.1" value={f.bhxh_employee_rate} disabled={!canEdit} onChange={e=>set('bhxh_employee_rate',e.target.value)}/></label><label>BHYT người lao động (%)<input type="number" min="0" step="0.1" value={f.bhyt_employee_rate} disabled={!canEdit} onChange={e=>set('bhyt_employee_rate',e.target.value)}/></label><label>BHTN người lao động (%)<input type="number" min="0" step="0.1" value={f.bhtn_employee_rate} disabled={!canEdit} onChange={e=>set('bhtn_employee_rate',e.target.value)}/></label></div>
    <div className="two-col"><label>Giảm trừ bản thân<input type="number" min="0" step="100000" value={f.personal_deduction} disabled={!canEdit} onChange={e=>set('personal_deduction',e.target.value)}/></label><label>Giảm trừ / người phụ thuộc<input type="number" min="0" step="100000" value={f.dependent_deduction} disabled={!canEdit} onChange={e=>set('dependent_deduction',e.target.value)}/></label></div>
    <div className="pit-brackets"><strong>Biểu thuế TNCN lũy tiến</strong>{(f.pit_brackets||[]).map((b,i)=><div key={i}><span>Bậc {i+1}</span><label>Đến (đ/tháng)<input type="number" disabled={!canEdit||i===f.pit_brackets.length-1} value={b.up_to??''} onChange={e=>setF(x=>({...x,pit_brackets:x.pit_brackets.map((v,j)=>j===i?{...v,up_to:e.target.value}:v)}))}/></label><label>Thuế suất (%)<input type="number" min="0" step="1" value={b.rate} disabled={!canEdit} onChange={e=>setF(x=>({...x,pit_brackets:x.pit_brackets.map((v,j)=>j===i?{...v,rate:e.target.value}:v)}))}/></label></div>)}</div>
    <div><strong>Lịch sử phiên bản</strong><div className="table-wrap"><table><thead><tr><th>Phiên bản</th><th>Ngày hiệu lực</th><th>BHXH</th><th>BHYT</th><th>BHTN</th><th>Giảm trừ bản thân</th><th>Người phụ thuộc</th></tr></thead><tbody>{history.map((item,index)=><tr key={item.version||index}><td>{item.version||'Chưa gán phiên bản'}</td><td>{dateVN(item.effective_from)}</td><td>{item.bhxh_employee_rate??'—'}%</td><td>{item.bhyt_employee_rate??'—'}%</td><td>{item.bhtn_employee_rate??'—'}%</td><td>{money(item.personal_deduction)}</td><td>{money(item.dependent_deduction)}</td></tr>)}</tbody></table></div></div>
    {!canEdit&&<div className="payroll-settings-note">Chỉ Super Admin được tạo hoặc thay đổi phiên bản cấu hình.</div>}
    <div className="modal-actions"><button type="button" className="btn" onClick={onCancel}>Đóng</button>{canEdit&&<button className="btn primary" disabled={busy}><Save/> {busy?'Đang lưu...':'Lưu phiên bản mới'}</button>}</div>
  </form>;
}

function PayslipModal({data,onClose,notify}){
  const ref=useRef(null);
  const [pdfBlob,setPdfBlob]=useState(null),[busy,setBusy]=useState(false),[exportError,setExportError]=useState('');
  const preparePdf=async(isActive=()=>true)=>{
    if(!ref.current){setExportError('Không tìm thấy nội dung phiếu lương để xuất PDF.');return}
    setBusy(true);setPdfBlob(null);setExportError('');
    try{
      const blob=await createPayslipPdfBlob(ref.current);
      if(isActive())setPdfBlob(blob);
    }catch(error){
      if(isActive()){
        const message=error.message||'Không thể tạo PDF.';
        setExportError(message);
        notify(message,'error');
      }
    }finally{if(isActive())setBusy(false)}
  };
  useEffect(()=>{
    if(!data){setPdfBlob(null);setExportError('');return}
    let active=true;
    const frame=requestAnimationFrame(()=>preparePdf(()=>active));
    return()=>{active=false;cancelAnimationFrame(frame)};
  },[data]);
  const downloadPdf=()=>{
    if(!pdfBlob){notify('PDF chưa sẵn sàng. Vui lòng đợi rồi thử lại.','error');return}
    try{
      const url=URL.createObjectURL(pdfBlob);
      const anchor=document.createElement('a');
      anchor.href=url;
      anchor.download=payslipFilename(data);
      anchor.style.display='none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
      notify('Đã tải phiếu lương PDF (1 trang A4).');
    }catch(error){notify(error.message||'Không thể tải file PDF.','error')}
  };
  if(!data)return null;
  const print=()=>window.print();
  return <div className="payslip-overlay"><div className="payslip-shell"><div className="payslip-toolbar"><strong><FileText/> Phiếu lương</strong><div><button className="btn ghost" aria-label="In phiếu lương hoặc lưu PDF" onClick={print}>In / Lưu PDF</button><button className="btn primary" aria-label="Tải phiếu lương PDF" disabled={busy||!pdfBlob} onClick={downloadPdf}><Download/> {busy?'Đang chuẩn bị PDF...':'Tải PDF'}</button><button className="icon-button" aria-label="Đóng phiếu lương" onClick={onClose}><X/></button></div></div>{(busy||exportError)&&<div className={`payslip-export-status ${exportError?'error':''}`} role={exportError?'alert':'status'}><span>{exportError||'Đang chuẩn bị PDF...'}</span>{exportError&&<button type="button" className="link-btn" onClick={()=>preparePdf()}>Thử tạo lại</button>}</div>}<PayslipDocument ref={ref} data={data}/></div></div>;
}

async function createPayslipPdfBlob(element){
  const canvas=await html2canvas(element,{scale:2.2,backgroundColor:'#ffffff',useCORS:true,logging:false});
  if(!canvas.width||!canvas.height)throw new Error('Phiếu lương không có nội dung để xuất.');
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const pageW=210,pageH=297,margin=8;
  const ratio=Math.min((pageW-margin*2)/canvas.width,(pageH-margin*2)/canvas.height);
  const width=canvas.width*ratio,height=canvas.height*ratio;
  pdf.addImage(canvas.toDataURL('image/jpeg',0.96),'JPEG',(pageW-width)/2,(pageH-height)/2,width,height);
  return pdf.output('blob');
}

function payslipFilename(data){
  const employee=data.employee||{},period=data.period||{};
  const safePart=value=>String(value||'').trim().replace(/\s+/g,'_').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'');
  const employeeName=safePart(employee.full_name)||'nhan_vien';
  const employeeCode=safePart(employee.employee_code);
  return `Phieu_luong_${employeeName}${employeeCode?`_${employeeCode}`:''}_${String(period.salary_month||'').padStart(2,'0')}-${period.salary_year||''}.pdf`;
}

const PayslipDocument=forwardRef(function PayslipDocument({data},ref){
  const e=data.employee||{},i=data.item||{},p=data.period||{},c=data.company||{};
  const totalDeduction=i.total_deduction??DEDUCTION_FIELDS.reduce((sum,field)=>sum+(Number(i[field])||0),0);
  return <div className="payslip-document" ref={ref}>
    <div className="payslip-company"><img src="/assets/images/logo-th79.png"/><div><strong>{c.company_name}</strong><span>Địa chỉ: {c.address}</span><span>Email: {c.email||'congtytnhdaututh79@gmail.com'} | Website: {c.website||'daututh79.com'}</span></div><div><span>MST: {c.tax_code}</span><span>{c.phone?`Hotline: ${c.phone}`:''}</span></div></div>
    <h1>PHIẾU LƯƠNG THÁNG {String(p.salary_month||'').padStart(2,'0')}/{p.salary_year}</h1>
    <table className="payslip-info"><tbody>
      <tr><td><b>Họ Tên NV:</b> {e.full_name||'—'}</td><td><b>Mã NV:</b> {e.employee_code||e.id||'—'}</td></tr>
      <tr><td><b>Chức Danh:</b> {e.position_name||'—'}</td><td><b>STK:</b> {e.bank_account_number||'—'} {e.bank_name?`(${e.bank_name})`:''}</td></tr>
      <tr><td><b>Nhận Việc:</b> {dateVN(e.join_date)}</td><td><b>Ngày công chuẩn:</b> {i.standard_work_days||0}</td></tr>
      <tr><td><b>Công thực tế:</b> {i.actual_work_days||0}</td><td><b>Các khoản khấu trừ:</b></td></tr>
      <tr><td><b>Lương áp dụng:</b> {money(i.applied_salary)}</td><td><b>BHXH</b><span>{money(i.social_insurance_employee)}</span></td></tr>
      <tr><td><b>Lương theo công:</b> {money(i.salary_by_work_days)}</td><td><b>BHYT</b><span>{money(i.health_insurance_employee)}</span></td></tr>
      <tr><td><b>Phụ cấp:</b> {money(i.allowance_total)}</td><td><b>BHTN</b><span>{money(i.unemployment_insurance_employee)}</span></td></tr>
      <tr><td><b>Lương ngoài giờ:</b> {money(i.overtime_pay)}</td><td><b>Thuế TNCN</b><span>{money(i.personal_income_tax)}</span></td></tr>
      <tr><td><b>Thưởng / thu nhập khác:</b> {money((Number(i.bonus)||0)+(Number(i.other_income)||0))}</td><td><b>Khấu trừ khác</b><span>{money(i.other_deduction)}</span></td></tr>
      <tr><td><b>Gross:</b><span>{money(i.gross_salary)}</span></td><td><b>Tổng khấu trừ:</b><span>{money(totalDeduction)}</span></td></tr>
      <tr className="payslip-net"><td colSpan="2"><b>Thực lĩnh</b><strong>{money(i.net_salary)}</strong></td></tr>
    </tbody></table>
    <div className="payslip-foot"><span>Phiếu lương được xuất từ hệ thống HRM T&H 79.</span><span>Ngày xuất: {new Date().toLocaleDateString('vi-VN')}</span></div>
  </div>;
});

function periodKey(p){return String(p.manage_id||p.id||p._id||'')}
function dateVN(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('vi-VN')}
function dateInput(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)}
function normalizeSettings(settings){
  return {
    ...LEGAL_DEFAULTS_2026,
    ...settings,
    effective_from:dateInput(settings?.effective_from)||LEGAL_DEFAULTS_2026.effective_from,
    version:settings?.version||LEGAL_DEFAULTS_2026.version,
    pit_brackets:settings?.pit_brackets||LEGAL_DEFAULTS_2026.pit_brackets.map(bracket=>({...bracket}))
  };
}

async function fetchPayrollDetail(periodId,includeBirthDate){
  const detail=await api(`/payroll/periods/${encodeURIComponent(periodId)}`);
  const items=detail.items||[];
  const employeeIds=[...new Set(items.filter(item=>{
    const employee=item.employee||{};
    return payrollEmployeeId(item)&&(!employee.full_name||!employee.position_name||(includeBirthDate&&!employee.date_of_birth));
  }).map(payrollEmployeeId))];
  if(!employeeIds.length)return {detail,lookupFailures:0};

  const results=await Promise.allSettled(employeeIds.map(async id=>{
    const result=await api(`/employees/${encodeURIComponent(id)}`);
    return [id,result.employee||result];
  }));
  const employees=new Map();
  let lookupFailures=0;
  results.forEach(result=>{
    if(result.status==='fulfilled')employees.set(result.value[0],result.value[1]);
    else lookupFailures++;
  });
  return {
    detail:{...detail,items:items.map(item=>({
      ...item,
      employee:{...item.employee,...employees.get(payrollEmployeeId(item))}
    }))},
    lookupFailures
  };
}

function payrollEmployeeId(item){
  const value=item.employee_id??item.employee?.id??item.employee?._id;
  if(value&&typeof value==='object'&&value.$oid)return String(value.$oid);
  return value===null||value===undefined||value===''?'':String(value);
}

function employeeAge(value){
  const birthDate=new Date(value);
  if(Number.isNaN(birthDate.getTime()))return null;
  const today=new Date();
  let age=today.getFullYear()-birthDate.getFullYear();
  if(today.getMonth()<birthDate.getMonth()||(today.getMonth()===birthDate.getMonth()&&today.getDate()<birthDate.getDate()))age--;
  return age>=0?age:null;
}
