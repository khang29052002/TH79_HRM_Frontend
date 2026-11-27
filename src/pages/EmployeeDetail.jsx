import {useEffect,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {
  ArrowLeft,Edit3,CloudUpload,FileText,FileCheck2,FileWarning,
  CalendarDays,FileSignature,TriangleAlert,BadgeCheck,
  History,ShieldCheck,Paperclip,Eye,Download,Trash2,ScanLine,
  ChevronDown,ChevronRight,LockKeyhole,SquarePen
} from 'lucide-react';
import {api,apiUrl} from '../lib/api';
import {Badge,Empty,Loading} from '../components/ui';
import {entityId,entityKey,fmtDate,initials,money} from '../lib/format';
import {useAuth} from '../hooks/useAuth';

const DOC_PRESENT=['received','uploaded'];
const DOC_VERIFIED=['verified','approved'];

export default function EmployeeDetail(){
  const {id}=useParams();
  const nav=useNavigate();
  const {has}=useAuth();
  const [data,setData]=useState(null);
  const [look,setLook]=useState(null);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [toast,setToast]=useState(null);
  const [tab,setTab]=useState('personal');
  const [openAcc,setOpenAcc]=useState({personal:true,bank:false,docs:false});
  const invalidId=!id||['undefined','null'].includes(String(id));

  useEffect(()=>{
    let alive=true;
    (async()=>{
      if(invalidId){setError('Liên kết hồ sơ không hợp lệ. Vui lòng mở nhân viên từ danh sách.');return;}
      try{
        setError('');
        const [detail,lookups]=await Promise.all([
          api(`/employees/${encodeURIComponent(id)}`),
          api('/employees/lookups')
        ]);
        if(alive){setData(detail);setLook(lookups);}
      }catch(err){if(alive)setError(err.message||'Không thể tải hồ sơ nhân viên.');}
    })();
    return()=>{alive=false};
  },[id,refresh]);

  const reload=()=>setRefresh(x=>x+1);
  const notify=(message,tone='success')=>setToast({message,tone,key:Date.now()});

  useEffect(()=>{
    if(!toast)return;
    const timer=setTimeout(()=>setToast(null),3600);
    return()=>clearTimeout(timer);
  },[toast]);

  if(error)return <section className="card employee-detail-load-error">
    <TriangleAlert/>
    <strong>Không thể mở hồ sơ nhân viên</strong>
    <span>{error}</span>
    <button className="btn primary" onClick={()=>nav('/employees',{replace:true})}><ArrowLeft/> Về danh sách nhân sự</button>
  </section>;
  if(!data||!look)return <Loading/>;

  const e=data.employee||{};
  const employeeId=entityId(e);
  const docTypes=look.documentTypes||[];
  const requiredTypes=docTypes.filter(x=>Number(x.is_required)===1);
  const docs=data.documents||[];
  const contracts=data.contracts||[];
  const salaryProfiles=data.salaryProfiles||[];
  const decisions=data.decisions||[];

  const documentByType=new Map(docs.map(d=>[Number(d.document_type_id),d]));
  const completedRequired=requiredTypes.filter(t=>documentIsPresent(documentByType.get(Number(t.id))));
  const coreFields=['employee_code','full_name','branch_name','department_name','position_name','phone','email','join_date','employment_status','recruitment_decision_no'];
  const corePercent=Math.round(coreFields.filter(k=>Boolean(e[k])).length/coreFields.length*100);
  const docPercent=requiredTypes.length?Math.round(completedRequired.length/requiredTypes.length*100):100;
  const activeContract=contracts.some(c=>c.status==='active');
  const contractPercent=activeContract?100:(contracts.length?55:0);
  const profileScore=clamp(Math.round(corePercent*.45+docPercent*.35+contractPercent*.20),0,100);
  const tenure=tenureLabel(e.join_date);
  const journey=buildJourney(e,contracts,decisions,data.history||[]);
  const probation=probationState(e);
  const toggleAcc=k=>setOpenAcc(prev=>({...prev,[k]:!prev[k]}));

  const remove=async()=>{
    if(!employeeId)return;
    if(!confirm(`Xóa mềm hồ sơ ${e.full_name}?`))return;
    try{await api(`/employees/${encodeURIComponent(employeeId)}`,{method:'DELETE'});nav('/employees');}
    catch(err){setError(err.message||'Không thể xóa hồ sơ.');}
  };

  return <div className="emp-sheet-page">
    {toast&&<div key={toast.key} className={`app-toast ${toast.tone}`} role="status">{toast.tone==='error'?<TriangleAlert/>:<BadgeCheck/>}<span>{toast.message}</span><button type="button" onClick={()=>setToast(null)}>×</button></div>}

    <div className="emp-sheet-topbar">
      <button type="button" className="btn ghost small" onClick={()=>nav('/employees')}><ArrowLeft size={15}/> Danh sách</button>
      <div className="emp-sheet-title-wrap">
        <h1>THÔNG TIN NHÂN VIÊN</h1>
        <div className="emp-sheet-sub">
          <span className="emp-mini-avatar">{initials(e.full_name)}</span>
          <strong>{e.full_name}</strong>
          <span>· {e.employee_code} ·</span>
          <Badge value={e.employment_status}/>
          <span className="emp-score-chip">{profileScore}% hoàn thiện</span>
        </div>
      </div>
      <div className="emp-sheet-actions">
        {has('employee.update')&&employeeId&&<Link className="btn primary small" to={`/employees/${encodeURIComponent(employeeId)}/edit`}><Edit3 size={15}/> Chỉnh sửa</Link>}
      </div>
    </div>

    {probation.show&&<div className={`ed-probation-alert ${probation.tone}`}>
      <TriangleAlert/>
      <div><strong>{probation.title}</strong><span>{probation.detail}</span></div>
    </div>}

    <div className="emp-seg-tabs" role="tablist">
      <button type="button" className={tab==='work'?'active':''} onClick={()=>setTab('work')}>Thông tin làm việc</button>
      <button type="button" className={tab==='personal'?'active':''} onClick={()=>setTab('personal')}>Thông tin nhân viên</button>
      {(has('contract.view')||has('payroll.view'))&&<button type="button" className={tab==='contract_salary'?'active':''} onClick={()=>setTab('contract_salary')}>Hợp đồng &amp; Lương</button>}
      <button type="button" className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Lịch sử ({journey.length})</button>
    </div>

    <div className="emp-sheet-body card">
      {tab==='work'&&<div className="emp-acc-panel">
        <div className="emp-acc-head static">
          <SquarePen size={17}/>
          <strong>Thông tin làm việc</strong>
          <small>Thâm niên: {tenure}</small>
        </div>
        <div className="emp-hform">
          <ViewRow label="Mã nhân viên / Trạng thái:">
            <div className="emp-hrow-pair">
              <ValBox value={e.employee_code}/>
              <ValBox value={statusTitle(e.employment_status)}/>
            </div>
          </ViewRow>
          <ViewRow label="Chi nhánh / Phòng ban:">
            <div className="emp-hrow-pair">
              <ValBox value={e.branch_name}/>
              <ValBox value={e.department_name}/>
            </div>
          </ViewRow>
          <ViewRow label="Chức vụ / QĐ tuyển dụng:">
            <div className="emp-hrow-pair">
              <ValBox value={e.position_name}/>
              <ValBox value={e.recruitment_decision_no}/>
            </div>
          </ViewRow>
          <ViewRow label="Ngày nhận việc / Hết thử việc:">
            <div className="emp-hrow-pair">
              <ValBox value={fmtDate(e.join_date)}/>
              <ValBox value={fmtDate(e.probation_end_date||e.probation_due_date)}/>
            </div>
          </ViewRow>
          <ViewRow label="Tình trạng hợp đồng:">
            <ValBox value={e.contract_status_name||e.contract_status}/>
          </ViewRow>
          <ViewRow label="Ghi chú nội bộ:">
            <ValBox value={e.note||'Không có ghi chú'}/>
          </ViewRow>
        </div>
      </div>}

      {tab==='personal'&&<>
        <div className="emp-acc-panel">
          <button type="button" className="emp-acc-head" onClick={()=>toggleAcc('personal')}>
            <SquarePen size={17}/>
            <strong>Thông tin cá nhân</strong>
            {openAcc.personal?<ChevronDown size={17}/>:<ChevronRight size={17}/>}
          </button>
          {openAcc.personal&&<div className="emp-hform">
            <ViewRow label="Mã nhân viên:"><ValBox value={e.employee_code} muted/></ViewRow>
            <ViewRow label="Họ và tên nhân viên:"><ValBox value={e.full_name}/></ViewRow>
            <ViewRow label="Trình độ chuyên môn:"><ValBox value={e.professional_qualification}/></ViewRow>
            <ViewRow label="SĐT / Mail:">
              <div className="emp-hrow-pair">
                <ValBox value={e.phone}/>
                <ValBox value={e.email}/>
              </div>
            </ViewRow>
            {has('employee.sensitive.view')?<>
              <ViewRow label="Số CCCD:"><ValBox value={e.identity_number}/></ViewRow>
              <ViewRow label="Ngày sinh / Giới tính:">
                <div className="emp-hrow-pair">
                  <ValBox value={fmtDate(e.date_of_birth)}/>
                  <ValBox value={genderLabel(e.gender)}/>
                </div>
              </ViewRow>
              <ViewRow label="Thường trú:"><ValBox value={e.permanent_address}/></ViewRow>
              <ViewRow label="Nơi ở hiện tại:"><ValBox value={e.current_address}/></ViewRow>
              <ViewRow label="Số BHXH / Tình trạng:">
                <div className="emp-hrow-pair">
                  <ValBox value={e.social_insurance_number||e.social_insurance_raw}/>
                  <ValBox value={insuranceLabel(e.social_insurance_status)}/>
                </div>
              </ViewRow>
            </>:<div className="ed-sensitive-locked"><LockKeyhole/><span><strong>Dữ liệu nhạy cảm đã được ẩn</strong><small>Cần quyền xem dữ liệu nhạy cảm để xem ngày sinh, CCCD, BHXH và địa chỉ.</small></span></div>}
          </div>}
        </div>

        <div className="emp-acc-panel">
          <button type="button" className="emp-acc-head" onClick={()=>toggleAcc('bank')}>
            <SquarePen size={17}/>
            <strong>Thông tin ngân hàng</strong>
            {openAcc.bank?<ChevronDown size={17}/>:<ChevronRight size={17}/>}
          </button>
          {openAcc.bank&&<div className="emp-hform">
            <ViewRow label="Số tài khoản / Ngân hàng:">
              <div className="emp-hrow-pair">
                <ValBox value={e.bank_account_number}/>
                <ValBox value={e.bank_name}/>
              </div>
            </ViewRow>
            <ViewRow label="Số người phụ thuộc:"><ValBox value={String(e.tax_dependents??0)}/></ViewRow>
          </div>}
        </div>

        {has('document.view')&&<div className="emp-acc-panel">
          <button type="button" className="emp-acc-head" onClick={()=>toggleAcc('docs')}>
            <SquarePen size={17}/>
            <strong>Thông tin hồ sơ</strong>
            <small>{completedRequired.length}/{requiredTypes.length} bắt buộc</small>
            {openAcc.docs?<ChevronDown size={17}/>:<ChevronRight size={17}/>}
          </button>
          {openAcc.docs&&<div className="ed-document-grid" style={{paddingTop:12}}>
            {docTypes.map((type,i)=><DocumentCard key={entityKey(type,`doc-type-${i}`)} type={type} doc={documentByType.get(Number(type.id))} employeeId={employeeId} canUpload={has('document.upload')} canDelete={has('document.delete')} onChanged={reload} notify={notify}/>)}
          </div>}
        </div>}
      </>}

      {tab==='contract_salary'&&<div className="emp-acc-stack">
        {has('contract.view')&&<ContractsSection employeeId={employeeId} employee={e} contracts={contracts} contractTypes={data.contractTypes||[]} canManage={has('contract.manage')} canUpload={has('contract.upload')} onChanged={reload} notify={notify}/>}
        {has('payroll.view')&&<section className="ed-section" id="salary" style={{marginTop:16}}>
          <SectionHead title="Thông tin lương" subtitle="Lịch sử cấu hình lương theo thời gian" right={<Link to="/payroll" className="ed-text-link">Mở tiền lương</Link>}/>
          <div className="ed-table-wrap"><table className="ed-table"><thead><tr><th>Hiệu lực từ</th><th>Lương chính thức</th><th>Lương thử việc</th><th>Lương đóng BH</th><th>Ăn trưa</th><th>Xăng xe</th><th>Điện thoại</th><th>Chuyên cần</th></tr></thead><tbody>
            {salaryProfiles.length?salaryProfiles.map((s,i)=><tr key={entityKey(s,`salary-${i}`)}><td>{fmtDate(s.effective_from)}</td><td>{money(s.base_salary)}</td><td>{money(s.probation_salary)}</td><td>{money(s.insurance_salary||s.base_salary)}</td><td>{money(s.lunch_allowance)}</td><td>{money(s.fuel_allowance)}</td><td>{money(s.phone_allowance)}</td><td>{money(s.attendance_allowance)}</td></tr>):<tr><td colSpan="8" className="ed-empty-cell">Chưa cấu hình hồ sơ lương.</td></tr>}
          </tbody></table></div>
        </section>}
      </div>}

      {tab==='history'&&<div className="emp-acc-panel">
        <div className="emp-acc-head static">
          <History size={17}/>
          <strong>Hành trình nhân sự</strong>
          <small>{journey.length} mốc</small>
        </div>
        <div className="ed-journey-list">
          {journey.length?journey.map((event,i)=><div className="ed-journey-event" key={`${event.date}-${event.title}-${i}`}>
            <div className="ed-journey-rail"><span className={`ed-journey-dot ${event.tone||'blue'}`}>{event.icon==='contract'?<FileSignature/>:event.icon==='decision'?<BadgeCheck/>:<CalendarDays/>}</span></div>
            <div className="ed-journey-date">{fmtDate(event.date)}</div>
            <div className="ed-journey-copy"><strong>{event.title}</strong><span>{event.meta}</span></div>
          </div>):<Empty title="Chưa có dữ liệu hành trình nhân sự"/>}
        </div>
        {has('employee.delete')&&<div className="ed-danger-zone"><button className="btn danger small" onClick={remove}><Trash2/> Xóa mềm hồ sơ nhân viên</button></div>}
      </div>}

      <div className="emp-sheet-footer">
        <button type="button" className="btn emp-done-btn" onClick={()=>nav('/employees')}>Hoàn tất</button>
      </div>
    </div>
  </div>;
}

function ViewRow({label,children}){
  return <div className="emp-hrow">
    <div className="emp-hlabel">{label}</div>
    <div className="emp-hfield">{children}</div>
  </div>;
}
function ValBox({value,muted=false}){
  return <div className={`emp-val-box ${muted?'muted':''}`}>{value||'Chưa cập nhật'}</div>;
}
function SectionHead({title,subtitle,icon:Icon,right}){return <div className="ed-section-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{right||(Icon&&<Icon/>)}</div>}

function DocumentCard({type,doc,employeeId,canUpload,canDelete,onChanged,notify}){
  const [file,setFile]=useState(null);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const files=doc?.files||[];
  const paperRecorded=DOC_PRESENT.includes(doc?.document_status);
  const hasDigital=files.length>0||Boolean(doc?.file_path);
  const verified=DOC_VERIFIED.includes(doc?.verification_status);
  const status=hasDigital?'Đã upload':paperRecorded?'Thiếu bản scan':'Còn thiếu';
  const pickFile=(selected)=>{
    setErr('');
    if(!selected){setFile(null);return;}
    if(selected.size>15*1024*1024){const message='Tệp vượt quá 15 MB. Vui lòng chọn tệp nhỏ hơn.';setFile(null);setErr(message);notify?.(message,'error');return;}
    if(!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(selected.type)){const message='Chỉ hỗ trợ PDF, PNG, JPG/JPEG hoặc WEBP.';setFile(null);setErr(message);notify?.(message,'error');return;}
    setFile(selected);
  };

  const upload=async()=>{
    if(!file||!employeeId)return;
    setBusy(true);setErr('');
    try{
      const fd=new FormData();
      fd.append('employee_id',employeeId);
      fd.append('document_type_id',entityId(type));
      fd.append('file',file);
      if(note)fd.append('note',note);
      const result=await api('/documents/upload',{method:'POST',body:fd});
      const message=result?.message||`Đã tải ${type.document_name} lên Cloudinary thành công.`;
      setFile(null);setNote('');setErr('');notify?.(message,'success');onChanged();
    }catch(e){const message=e.message||'Không thể tải hồ sơ.';setErr(message);notify?.(message,'error');}
    finally{setBusy(false);}
  };

  const del=async(fileId)=>{
    if(!confirm('Xóa tệp hồ sơ này?'))return;
    try{await api(`/documents/file/${encodeURIComponent(fileId)}`,{method:'DELETE'});setErr('');notify?.('Đã xóa tệp hồ sơ.','success');onChanged();}
    catch(e){const message=e.message||'Không thể xóa tệp.';setErr(message);notify?.(message,'error');}
  };

  return <article className={`ed-document-card ${hasDigital?'has-file':paperRecorded?'paper-only':'missing'}`}>
    <div className="ed-doc-top">
      <span className="ed-doc-icon">{hasDigital?<FileCheck2/>:<FileWarning/>}</span>
      <div className="ed-doc-title"><strong>{type.document_name}</strong><span>{hasDigital?`${files.length||1} tệp đã lưu`:paperRecorded?'Đã ghi nhận bản giấy nhưng chưa có file số':'Chưa có giấy tờ trong hệ thống'}</span></div>
      <div className="ed-doc-badges"><span className={`ed-doc-state ${hasDigital?'ok':paperRecorded?'warn':'missing'}`}>{status}</span>{hasDigital&&<span className={`ed-review-state ${verified?'verified':doc?.verification_status==='rejected'?'rejected':'pending'}`}>{verified?'Đã xác minh':doc?.verification_status==='rejected'?'Cần bổ sung':'Chờ xác minh'}</span>}</div>
    </div>

    {hasDigital&&<div className="ed-doc-files">
      {files.length?files.map((f,i)=><div className="ed-doc-file" key={entityKey(f,`file-${i}`)}>
        <span className="ed-file-type"><FileText/></span>
        <div><strong>{f.original_name||'Tệp hồ sơ'}</strong><small>{formatBytes(f.file_size)} · {fmtDate(f.uploaded_at||f.created_at)}</small></div>
        <div className="ed-file-actions"><a className="btn ghost small" href={apiUrl(`/documents/file/${encodeURIComponent(entityId(f))}`)} target="_blank" rel="noreferrer"><Eye/> Xem</a><a className="btn ghost small" href={apiUrl(`/documents/file/${encodeURIComponent(entityId(f))}?download=1`)}><Download/> Tải</a>{canDelete&&<button className="btn danger small icon-only" onClick={()=>del(entityId(f))}><Trash2/></button>}</div>
      </div>):<div className="ed-file-legacy"><FileText/> Tệp hồ sơ cũ đang được ghi nhận trong hệ thống.</div>}
    </div>}

    {!hasDigital&&<div className="ed-doc-empty"><span><ScanLine/></span><div><strong>{paperRecorded?'Chưa có bản scan/PDF':'Chưa có file giấy tờ'}</strong><small>{paperRecorded?'Hãy tải bản scan để xem lại trực tuyến.':'Tải PDF hoặc ảnh scan để lưu trữ và kiểm soát hồ sơ.'}</small></div></div>}

    {canUpload&&<div className="ed-inline-upload">
      <label className="ed-file-picker"><input type="file" accept="application/pdf,image/*" onChange={e=>pickFile(e.target.files?.[0]||null)}/><span><CloudUpload/></span><div><strong>{file?.name||'Chọn PDF / ảnh scan'}</strong><small>{file?'Đã chọn file, bấm Tải hồ sơ lên':'Bấm để chọn file từ máy tính'}</small></div></label>
      <input className="ed-note-input" placeholder="Ghi chú (không bắt buộc)" value={note} onChange={e=>setNote(e.target.value)}/>
      <button className="btn primary ed-upload-btn" disabled={!file||busy} onClick={upload}><CloudUpload/> {busy?'Đang tải...':'Tải hồ sơ lên'}</button>
    </div>}
    {err&&<div className="ed-inline-error">{err}</div>}
  </article>;
}

function ContractsSection({employeeId,employee,contracts,contractTypes,canManage,canUpload,onChanged,notify}){
  const [form,setForm]=useState({contract_type_id:'',contract_no:'',signed_date:'',start_date:employee.join_date||new Date().toISOString().slice(0,10),end_date:'',base_salary:'',allowance_amount:'',status:'active',note:''});
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const change=(k,v)=>setForm(x=>({...x,[k]:v}));

  const submit=async e=>{
    e.preventDefault();if(!canManage||!employeeId||!form.contract_type_id||!form.start_date)return;
    setBusy(true);setErr('');
    try{
      const created=await api('/contracts',{method:'POST',body:JSON.stringify({...form,employee_id:employeeId})});
      if(file&&canUpload&&created?.id){const fd=new FormData();fd.append('file',file);await api(`/contracts/${created.id}/files`,{method:'POST',body:fd});}
      setForm(x=>({...x,contract_no:'',signed_date:'',end_date:'',base_salary:'',allowance_amount:'',note:''}));setFile(null);setErr('');notify?.('Đã lưu hợp đồng và tệp đính kèm thành công.','success');onChanged();
    }catch(ex){const message=ex.message||'Không thể lưu hợp đồng.';setErr(message);notify?.(message,'error');}
    finally{setBusy(false);}
  };

  return <section className="ed-section" id="contracts">
    <SectionHead title="Hợp đồng lao động" subtitle="Quản lý hợp đồng và file PDF/ảnh scan của từng nhân viên" right={<Link to="/contracts" className="ed-text-link">Quản lý hợp đồng</Link>}/>
    {canManage&&<div className="ed-contract-panel">
      <div className="ed-contract-title"><span><FileSignature/></span><div><strong>Thêm &amp; tải hợp đồng nhân viên</strong><small>Có thể tạo hợp đồng và đính kèm PDF/ảnh scan cùng lúc.</small></div></div>
      <form className="ed-contract-form" onSubmit={submit}>
        <label className="type"><span>Loại hợp đồng</span><select value={form.contract_type_id} onChange={e=>change('contract_type_id',e.target.value)} required><option value="">Chọn loại hợp đồng</option>{contractTypes.map((t,i)=><option key={entityKey(t,`ct-${i}`)} value={entityId(t)}>{t.contract_type_name}</option>)}</select></label>
        <label className="number"><span>Số hợp đồng</span><input value={form.contract_no} onChange={e=>change('contract_no',e.target.value)} placeholder="Ví dụ: HĐLĐ-001/2026"/></label>
        <label><span>Ngày ký</span><input type="date" value={form.signed_date} onChange={e=>change('signed_date',e.target.value)}/></label>
        <label><span>Ngày bắt đầu</span><input type="date" required value={form.start_date} onChange={e=>change('start_date',e.target.value)}/></label>
        <label><span>Ngày kết thúc</span><input type="date" value={form.end_date} onChange={e=>change('end_date',e.target.value)}/></label>
        <label className="file"><span>File hợp đồng</span><div className="ed-contract-file"><Paperclip/><input type="file" accept="application/pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><em>{file?.name||'PDF hoặc ảnh scan'}</em></div></label>
        <button className="btn primary submit" disabled={busy}><CloudUpload/> {busy?'Đang lưu...':'Lưu hợp đồng & file'}</button>
      </form>
      {err&&<div className="ed-inline-error">{err}</div>}
    </div>}
    <div className="ed-table-wrap"><table className="ed-table"><thead><tr><th>Số HĐ</th><th>Loại hợp đồng</th><th>Bắt đầu</th><th>Kết thúc</th><th>Lương cơ bản</th><th>File</th><th>Trạng thái</th></tr></thead><tbody>
      {contracts.length?contracts.map((c,i)=><tr key={entityKey(c,`contract-${i}`)}><td><strong>{c.contract_no||'—'}</strong></td><td>{c.contract_type_name||'—'}</td><td>{fmtDate(c.start_date)}</td><td>{fmtDate(c.end_date)}</td><td>{Number(c.base_salary)?money(c.base_salary):'—'}</td><td>{c.files?.length||0} file</td><td><Badge value={c.status}/></td></tr>):<tr><td colSpan="7" className="ed-empty-cell">Chưa có hợp đồng chi tiết trong hệ thống.</td></tr>}
    </tbody></table></div>
  </section>;
}

function documentIsPresent(doc){return Boolean(doc&&(DOC_PRESENT.includes(doc.document_status)||DOC_VERIFIED.includes(doc.verification_status)||(doc.files||[]).length||doc.file_path));}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function genderLabel(v){return ({male:'Nam',female:'Nữ',other:'Khác',unknown:'Chưa cập nhật'})[v]||'Chưa cập nhật';}
function insuranceLabel(v){return ({has_number:'Đã có mã BHXH',not_yet:'Chưa có mã BHXH',external_company:'Đóng tại công ty khác',unknown:'Chưa cập nhật'})[v]||v||'Chưa cập nhật';}
function formatBytes(v){const n=Number(v||0);if(!n)return '0 KB';if(n<1024*1024)return `${Math.max(1,Math.round(n/1024))} KB`;return `${(n/1024/1024).toFixed(1)} MB`;}
function tenureLabel(value){if(!value)return 'Chưa cập nhật';const d=new Date(value),now=new Date();if(Number.isNaN(d.getTime()))return 'Chưa cập nhật';if(d>now)return 'Sắp nhận việc';let months=(now.getFullYear()-d.getFullYear())*12+(now.getMonth()-d.getMonth());if(now.getDate()<d.getDate())months--;months=Math.max(0,months);const years=Math.floor(months/12),m=months%12;if(years)return `${years} năm ${m} tháng`;if(months)return `${months} tháng`;const days=Math.max(0,Math.floor((now-d)/86400000));return `${days} ngày`;}
function probationState(e){if(e.employment_status!=='probation')return {show:false};const raw=e.probation_end_date||e.probation_due_date;if(!raw)return {show:false};const due=new Date(raw);if(Number.isNaN(due.getTime()))return {show:false};const days=Math.ceil((due-new Date())/86400000);if(days>10)return {show:false};if(days<0)return {show:true,tone:'danger',title:'Hợp đồng thử việc đã quá hạn',detail:`Ngày hết hạn: ${fmtDate(raw)}. Cần xử lý chuyển chính thức hoặc cập nhật trạng thái.`};return {show:true,tone:days<=3?'danger':'warning',title:`Hợp đồng thử việc còn ${days} ngày`,detail:`Ngày hết hạn: ${fmtDate(raw)}. Cần xử lý gia hạn/chuyển chính thức trước hạn.`};}
function buildJourney(e,contracts,decisions,history){const out=[];if(e.join_date)out.push({date:e.join_date,title:'Nhận việc',meta:'Bắt đầu làm việc tại T&H 79',tone:'blue',icon:'join'});for(const c of contracts){if(c.start_date)out.push({date:c.start_date,title:`Bắt đầu ${c.contract_type_name||'hợp đồng'}`,meta:c.contract_no||'Hợp đồng lao động',tone:'violet',icon:'contract'});if(c.end_date)out.push({date:c.end_date,title:'Mốc kết thúc hợp đồng',meta:c.contract_no||c.contract_type_name||'Hợp đồng',tone:'amber',icon:'contract'});}for(const d of decisions){const date=d.effective_date||d.decision_date;if(date)out.push({date,title:d.title||d.decision_no||'Quyết định nhân sự',meta:d.decision_no||'Quyết định nhân sự',tone:'green',icon:'decision'});}for(const h of history){const date=h.effective_date||h.changed_at||h.created_at;if(date)out.push({date,title:statusTitle(h.new_status||h.status),meta:h.reason||h.note||'Thay đổi trạng thái nhân sự',tone:'blue',icon:'status'});}const seen=new Set();return out.sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(x=>{const k=`${String(x.date).slice(0,10)}|${x.title}|${x.meta}`;if(seen.has(k))return false;seen.add(k);return true;});}
function statusTitle(v){return ({active:'Nhân viên chính thức',probation:'Nhân viên thử việc',on_leave:'Nghỉ phép',resigned:'Đã nghỉ việc',terminated:'Chấm dứt hợp đồng',inactive:'Ngưng hoạt động'})[v]||v||'Cập nhật trạng thái';}
