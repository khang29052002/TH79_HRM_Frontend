import { useEffect, useMemo, useState } from 'react';
import { CalendarOff, Check, Clock, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Empty, Loading, Modal, PageHeader, StatCard, Toast } from '../components/ui';
import { fmtDate } from '../lib/format';
import { useAuth } from '../hooks/useAuth';
import { isValidDate, isValidNumber } from '../lib/validation';

export default function Leave() {
  const { has, user } = useAuth();
  const canApprove = has('attendance.manage') || has('employee.update');
  const [requests, setRequests] = useState(null);
  const [types, setTypes] = useState([]);
  const [balance, setBalance] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [query, setQuery] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = (message, tone = 'success') => setToast({ message, tone, key: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadBalance = async empId => {
    const q = empId ? `?employee_id=${encodeURIComponent(empId)}` : '';
    const balRes = await api(`/leave/balance${q}`);
    setBalance(balRes);
  };

  const load = async () => {
    const [reqRes, typeRes] = await Promise.all([
      api('/leave/requests'),
      api('/leave/types')
    ]);
    setRequests(reqRes.items || []);
    setTypes(typeRes.items || []);
    await loadBalance(filterEmployee || user?.employee_id || '');
    if (canApprove) {
      api('/employees?limit=200').then(r => setEmployees(r.items || [])).catch(() => {});
    }
  };

  useEffect(() => {
    load().catch(e => notify(e.message, 'error'));
  }, []);

  useEffect(() => {
    loadBalance(filterEmployee || user?.employee_id || '').catch(() => {});
  }, [filterEmployee, user?.employee_id]);

  const shown = useMemo(() => {
    const list = requests || [];
    const q = query.trim().toLowerCase();
    return list.filter(r => {
      if (filterKind && r.request_kind !== filterKind) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterEmployee && String(r.employee_id) !== String(filterEmployee)) return false;
      if (!q) return true;
      return `${r.employee_name || ''} ${r.employee_code || ''} ${r.leave_name || ''} ${r.reason || ''}`.toLowerCase().includes(q);
    });
  }, [requests, query, filterKind, filterStatus, filterEmployee]);

  if (!requests) return <Loading />;

  const review = async (id, status) => {
    try {
      await api(`/leave/requests/${id}/review`, { method: 'POST', body: JSON.stringify({ status }) });
      notify(status === 'approved' ? 'Đã duyệt đơn và đồng bộ vào bảng chấm công.' : 'Đã từ chối đơn.');
      await load();
    } catch (e) { notify(e.message, 'error'); }
  };

  const removeRequest = async r => {
    if (!window.confirm(`Xóa đơn ${r.leave_name} của ${r.employee_name || 'nhân viên'}?`)) return;
    try {
      await api(`/leave/requests/${r.id}`, { method: 'DELETE' });
      notify('Đã xóa đơn và cập nhật lại dữ liệu chấm công.');
      await load();
    } catch (e) { notify(e.message, 'error'); }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedOt = requests.filter(r => r.request_kind === 'overtime' && r.status === 'approved').reduce((s, r) => s + Number(r.hours || 0), 0);
  const selectedEmp = employees.find(e => String(e.id) === String(filterEmployee));
  const balanceLabel = selectedEmp ? `Quỹ phép · ${selectedEmp.full_name}` : 'Quỹ phép năm';

  return <>
    {toast && <Toast key={toast.key} message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}

    <PageHeader
      title="Quản lý nghỉ phép & làm thêm giờ (OT)"
      subtitle="Theo dõi quỹ phép năm, gửi đơn nghỉ phép / đăng ký tăng ca và phê duyệt tự động đồng bộ vào bảng chấm công & tiền lương."
      actions={<button className="btn primary" onClick={() => setOpenModal(true)}><Plus size={16} /> Tạo đơn mới</button>}
    />

    <div className="stats-grid four">
      <StatCard
        icon={CalendarOff}
        label={balanceLabel}
        value={balance?.is_probation ? '0 ngày (Thử việc)' : `${balance?.remaining_annual ?? 12}/${balance?.annual_quota ?? 12} ngày`}
        detail={balance?.is_probation
          ? `Tích lũy ${balance?.accrued_during_probation ?? 0} ngày (cộng dồn khi lên chính thức)`
          : `Đã dùng ${balance?.used_annual ?? 0} ngày (gồm thời gian thử việc)`}
        tone={balance?.is_probation ? 'amber' : 'green'}
      />
      <StatCard icon={Clock} label="Đơn chờ duyệt" value={pendingCount} detail="Nghỉ phép & OT" tone="amber" />
      <StatCard icon={Sparkles} label="Giờ OT đã duyệt" value={`${approvedOt} giờ`} detail="Tự động cộng khi tính lương" tone="violet" />
      <StatCard icon={CalendarOff} label="Tổng số đơn" value={requests.length} detail={`${shown.length} đơn đang hiển thị`} tone="blue" />
    </div>

    <div className="leave-policy-banner">
      <strong>Chính sách phép năm:</strong> Mỗi nhân sự chính thức có <b>12 ngày phép có lương/năm</b> (1 ngày/tháng, cộng dồn cả thời gian thử việc) áp dụng cho mọi lý do nghỉ trừ <b>Thai sản</b>. Nhân sự đang <b>thử việc</b> chưa được sử dụng phép năm (xin nghỉ sẽ tính <b>không lương</b>). Phép dư cuối năm không tự động quy đổi thành tiền mặt nếu vẫn làm việc (chỉ thanh toán khi thôi việc; dồn phép theo thỏa thuận).
    </div>

    <section className="card">
      <div className="filters leave-filters">
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm tên nhân viên, mã NV, lý do..." />
        </label>
        {canApprove && <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
          <option value="">Tất cả nhân viên</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.employee_code} · {emp.full_name}</option>)}
        </select>}
        <select value={filterKind} onChange={e => setFilterKind(e.target.value)}>
          <option value="">Tất cả loại đơn</option>
          <option value="leave">Đơn xin nghỉ phép</option>
          <option value="overtime">Đăng ký tăng ca (OT)</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Loại đơn</th>
              <th>Thời gian</th>
              <th>Số ngày / Giờ</th>
              <th>Lý do</th>
              <th>Trạng thái</th>
              <th className="actions-col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => <tr key={r.id}>
              <td><strong>{r.employee_name || `NV #${r.employee_id}`}</strong><small className="block">{r.employee_code} · {r.branch_name || 'Chưa phân chi nhánh'}</small></td>
              <td>
                <strong>{r.leave_name}</strong>
                <small className="block">
                  {r.request_kind === 'overtime'
                    ? 'Tăng ca OT'
                    : (Number(r.is_paid) === 1 ? 'Nghỉ có phép (hưởng lương)' : 'Nghỉ không lương')}
                </small>
              </td>
              <td>{fmtDate(r.start_date)}{r.end_date && r.end_date !== r.start_date ? ` → ${fmtDate(r.end_date)}` : ''}</td>
              <td><strong>{r.request_kind === 'overtime' ? `${r.hours} giờ` : `${r.total_days} ngày`}</strong></td>
              <td>{r.reason}</td>
              <td><Badge value={r.status} /></td>
              <td>
                <div className="row-actions">
                  {r.status === 'pending' && canApprove && <>
                    <button type="button" className="icon-btn success" title="Duyệt đơn" onClick={() => review(r.id, 'approved')}><Check size={16} /></button>
                    <button type="button" className="icon-btn danger" title="Từ chối đơn" onClick={() => review(r.id, 'rejected')}><X size={16} /></button>
                  </>}
                  {r.status === 'pending' && (canApprove || Number(r.employee_id) === Number(user?.employee_id)) && (
                    <button type="button" className="icon-button small" title="Sửa đơn" onClick={() => { setEditing(r); setOpenModal(true); }}><Pencil size={15} /></button>
                  )}
                  {(canApprove || (r.status === 'pending' && Number(r.employee_id) === Number(user?.employee_id))) && (
                    <button type="button" className="icon-button small danger-icon" title="Xóa đơn" onClick={() => removeRequest(r)}><Trash2 size={15} /></button>
                  )}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
        {!shown.length && <Empty title="Chưa có đơn nghỉ phép hoặc tăng ca" detail="Thử đổi bộ lọc hoặc bấm Tạo đơn mới." />}
      </div>
    </section>

    <Modal open={openModal} onClose={() => { setOpenModal(false); setEditing(null); }} title={editing ? `Chỉnh sửa đơn #${editing.id}` : 'Tạo đơn nghỉ phép / tăng ca'}>
      <LeaveOrOtForm
        types={types}
        employees={employees}
        initial={editing}
        canChooseEmployee={canApprove && !editing}
        defaultEmployeeId={filterEmployee || user?.employee_id}
        done={async msg => { setOpenModal(false); setEditing(null); notify(msg); await load(); }}
      />
    </Modal>
  </>;
}

function LeaveOrOtForm({ types, employees, initial, canChooseEmployee, defaultEmployeeId, done }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    employee_id: initial?.employee_id || defaultEmployeeId || employees[0]?.id || '',
    request_kind: initial?.request_kind || 'leave',
    leave_type_id: initial?.leave_type_id || types[0]?.id || 1,
    start_date: initial?.start_date ? String(initial.start_date).slice(0, 10) : today,
    end_date: initial?.end_date ? String(initial.end_date).slice(0, 10) : today,
    hours: initial?.hours || 2,
    reason: initial?.reason || ''
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [empBalance, setEmpBalance] = useState(null);

  useEffect(() => {
    if (!f.employee_id) { setEmpBalance(null); return; }
    api(`/leave/balance?employee_id=${encodeURIComponent(f.employee_id)}`)
      .then(setEmpBalance)
      .catch(() => setEmpBalance(null));
  }, [f.employee_id]);

  const submit = async e => {
    e.preventDefault();
    setErr('');
    if (!isValidDate(f.start_date) || !isValidDate(f.request_kind === 'overtime' ? f.start_date : f.end_date)) {
      setErr('Ngày bắt đầu hoặc ngày kết thúc không hợp lệ.');
      return;
    }
    if (f.start_date < today) {
      setErr('Không thể tạo hoặc sửa đơn cho ngày trong quá khứ.');
      return;
    }
    if (f.request_kind === 'leave' && f.end_date < f.start_date) {
      setErr('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
      return;
    }
    if (f.request_kind === 'overtime' && (!isValidNumber(f.hours, { min: 0.5, max: 12 }) || Number(f.hours) * 2 % 1 !== 0)) {
      setErr('Số giờ OT phải từ 0,5 đến 12 giờ và theo bước 0,5 giờ.');
      return;
    }
    if (String(f.reason || '').trim().length < 3) {
      setErr('Lý do phải có ít nhất 3 ký tự.');
      return;
    }
    setBusy(true);
    try {
      if (initial?.id) {
        await api(`/leave/requests/${initial.id}`, { method: 'PUT', body: JSON.stringify(f) });
        done('Đã cập nhật đơn thành công.');
      } else {
        await api('/leave/requests', { method: 'POST', body: JSON.stringify(f) });
        done(f.request_kind === 'overtime' ? 'Đã gửi đăng ký tăng ca (OT).' : 'Đã gửi đơn xin nghỉ phép.');
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return <form className="form-stack" onSubmit={submit}>
    {err && <div className="form-error">{err}</div>}
    {canChooseEmployee && <label>
      <span>Nhân viên</span>
      <select required value={f.employee_id} onChange={e => setF({ ...f, employee_id: e.target.value })}>
        <option value="">-- Chọn nhân viên --</option>
        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.employee_code} · {emp.full_name}</option>)}
      </select>
    </label>}
    <label>
      <span>Loại yêu cầu</span>
      <select value={f.request_kind} onChange={e => setF({ ...f, request_kind: e.target.value })}>
        <option value="leave">Đơn xin nghỉ phép</option>
        <option value="overtime">Đăng ký làm thêm giờ (OT)</option>
      </select>
    </label>
    {f.request_kind === 'leave' && empBalance && <div className={`leave-form-hint ${empBalance.is_probation ? 'warn' : 'info'}`}>
      {empBalance.is_probation
        ? <>Nhân viên đang <b>thử việc</b>: chưa dùng được phép năm, đơn nghỉ (trừ Thai sản) sẽ tính <b>không lương</b>. Phép tích lũy ({empBalance.accrued_during_probation} ngày) sẽ mở khi lên chính thức.</>
        : <>Quỹ phép năm còn <b>{empBalance.remaining_annual}/{empBalance.annual_quota} ngày</b> hưởng 100% lương{empBalance.remaining_annual <= 0 ? ' (đã hết quỹ phép, đơn mới sẽ tính không lương)' : ''}.</>}
    </div>}
    {f.request_kind === 'leave' && <label>
      <span>Loại nghỉ phép</span>
      <select value={f.leave_type_id} onChange={e => setF({ ...f, leave_type_id: e.target.value })}>
        {types.map(t => {
          const note = t.leave_code === 'MATERNITY'
            ? 'BHXH · Không trừ phép năm'
            : Number(t.is_paid) === 1
              ? (empBalance?.is_probation ? 'Thử việc · Không lương' : 'Có lương · Trừ phép năm')
              : 'Không hưởng lương';
          return <option key={t.id} value={t.id}>{t.leave_name} ({note})</option>;
        })}
      </select>
    </label>}
    <div className="two-col">
      <label>{f.request_kind === 'overtime' ? 'Ngày tăng ca' : 'Từ ngày'}<input type="date" min={today} required value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value, end_date: f.request_kind === 'overtime' ? e.target.value : (f.end_date < e.target.value ? e.target.value : f.end_date) })} /></label>
      {f.request_kind === 'leave'
        ? <label>Đến ngày<input type="date" min={f.start_date || today} required value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></label>
        : <label>Số giờ tăng ca<input type="number" min="0.5" max="12" step="0.5" required value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} /></label>}
    </div>
    <label>Lý do / Nội dung công việc<textarea required rows={3} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="Nhập lý do nghỉ hoặc đầu việc OT..." /></label>
    <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu...' : (initial ? 'Lưu thay đổi' : 'Gửi đơn')}</button>
  </form>;
}
