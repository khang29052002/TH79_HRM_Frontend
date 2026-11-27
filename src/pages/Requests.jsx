import { useEffect, useState } from 'react';
import { CalendarOff, Check, Clock3, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Empty, Loading, PageHeader, Toast } from '../components/ui';
import { fmtDate } from '../lib/format';

export default function Requests() {
  const [tab, setTab] = useState('profile');
  const [profileReqs, setProfileReqs] = useState(null);
  const [leaveReqs, setLeaveReqs] = useState([]);
  const [adjReqs, setAdjReqs] = useState([]);
  const [toast, setToast] = useState(null);

  const notify = (message, tone = 'success') => setToast({ message, tone, key: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = async () => {
    const [p, l, a] = await Promise.all([
      api('/self-service/requests'),
      api('/leave/requests').catch(() => ({ items: [] })),
      api('/attendance/adjustments').catch(() => ({ items: [] }))
    ]);
    setProfileReqs(p.items || []);
    setLeaveReqs(l.items || []);
    setAdjReqs(a.items || []);
  };

  useEffect(() => {
    load().catch(e => notify(e.message, 'error'));
  }, []);

  if (!profileReqs) return <Loading />;

  const reviewProfile = async (id, status) => {
    await api(`/self-service/requests/${id}/review`, { method: 'POST', body: JSON.stringify({ status }) });
    notify(status === 'approved' ? 'Đã duyệt cập nhật hồ sơ.' : 'Đã từ chối yêu cầu.');
    await load();
  };

  const reviewLeave = async (id, status) => {
    await api(`/leave/requests/${id}/review`, { method: 'POST', body: JSON.stringify({ status }) });
    notify(status === 'approved' ? 'Đã duyệt đơn nghỉ phép / OT.' : 'Đã từ chối đơn.');
    await load();
  };

  const reviewAdj = async (id, status) => {
    await api(`/attendance/adjustments/${id}/review`, { method: 'POST', body: JSON.stringify({ status }) });
    notify(status === 'approved' ? 'Đã duyệt giải trình & cập nhật bảng công.' : 'Đã từ chối giải trình.');
    await load();
  };

  const deleteLeave = async r => {
    if (!window.confirm(`Xóa đơn ${r.leave_name} của ${r.employee_name || 'nhân viên'}?`)) return;
    try {
      await api(`/leave/requests/${r.id}`, { method: 'DELETE' });
      notify('Đã xóa đơn nghỉ phép / OT.');
      await load();
    } catch (e) { notify(e.message, 'error'); }
  };

  const pPending = profileReqs.filter(x => x.status === 'pending').length;
  const lPending = leaveReqs.filter(x => x.status === 'pending').length;
  const aPending = adjReqs.filter(x => x.status === 'pending').length;

  return <>
    {toast && <Toast key={toast.key} message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    <PageHeader
      title="Trung tâm duyệt yêu cầu nhân viên"
      subtitle="Phê duyệt yêu cầu cập nhật hồ sơ, đơn nghỉ phép / tăng ca (OT) và đơn giải trình chấm công."
    />

    <div className="attendance-tabs">
      <button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
        <ShieldCheck size={16} /> Cập nhật hồ sơ {pPending > 0 && <em className="tab-pill">{pPending}</em>}
      </button>
      <button type="button" className={tab === 'leave' ? 'active' : ''} onClick={() => setTab('leave')}>
        <CalendarOff size={16} /> Nghỉ phép &amp; OT {lPending > 0 && <em className="tab-pill">{lPending}</em>}
      </button>
      <button type="button" className={tab === 'adjustment' ? 'active' : ''} onClick={() => setTab('adjustment')}>
        <Clock3 size={16} /> Giải trình công {aPending > 0 && <em className="tab-pill">{aPending}</em>}
      </button>
    </div>

    {tab === 'profile' && <section className="card">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nhân viên</th><th>Trường dữ liệu</th><th>Giá trị hiện tại</th><th>Giá trị đề nghị</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {profileReqs.map(r => <tr key={r.id}>
              <td><strong>{r.employee_name}</strong></td>
              <td>{r.field_code}</td>
              <td>{r.old_value || '—'}</td>
              <td>{r.new_value}</td>
              <td><Badge value={r.status} /></td>
              <td>{r.status === 'pending' && <div className="inline-actions">
                <button className="icon-btn success" onClick={() => reviewProfile(r.id, 'approved')}><Check size={17} /></button>
                <button className="icon-btn danger" onClick={() => reviewProfile(r.id, 'rejected')}><X size={17} /></button>
              </div>}</td>
            </tr>)}
          </tbody>
        </table>
        {!profileReqs.length && <Empty title="Chưa có yêu cầu cập nhật hồ sơ" />}
      </div>
    </section>}

    {tab === 'leave' && <section className="card">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nhân viên</th><th>Loại đơn</th><th>Thời gian</th><th>Số ngày / Giờ</th><th>Lý do</th><th>Trạng thái</th><th className="actions-col">Thao tác</th></tr></thead>
          <tbody>
            {leaveReqs.map(r => <tr key={r.id}>
              <td><strong>{r.employee_name}</strong><small className="block">{r.employee_code}</small></td>
              <td>
                <strong>{r.leave_name}</strong>
                <small className="block">{r.request_kind === 'overtime' ? 'Tăng ca OT' : (Number(r.is_paid) === 1 ? 'Nghỉ có phép (hưởng lương)' : 'Nghỉ không lương')}</small>
              </td>
              <td>{fmtDate(r.start_date)}{r.end_date && r.end_date !== r.start_date ? ` → ${fmtDate(r.end_date)}` : ''}</td>
              <td><strong>{r.request_kind === 'overtime' ? `${r.hours} giờ` : `${r.total_days} ngày`}</strong></td>
              <td>{r.reason}</td>
              <td><Badge value={r.status} /></td>
              <td>
                <div className="row-actions">
                  {r.status === 'pending' && <>
                    <button type="button" className="icon-btn success" title="Duyệt đơn" onClick={() => reviewLeave(r.id, 'approved')}><Check size={16} /></button>
                    <button type="button" className="icon-btn danger" title="Từ chối đơn" onClick={() => reviewLeave(r.id, 'rejected')}><X size={16} /></button>
                  </>}
                  <button type="button" className="icon-button small danger-icon" title="Xóa đơn" onClick={() => deleteLeave(r)}><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
        {!leaveReqs.length && <Empty title="Chưa có đơn nghỉ phép hoặc tăng ca" />}
      </div>
    </section>}

    {tab === 'adjustment' && <section className="card">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nhân viên</th><th>Ngày công</th><th>Giờ đề nghị</th><th>Lý do</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {adjReqs.map(r => <tr key={r.id}>
              <td><strong>{r.employee_name}</strong><small className="block">{r.employee_code}</small></td>
              <td>{fmtDate(r.work_date)}</td>
              <td>{r.requested_check_in} – {r.requested_check_out}</td>
              <td>{r.reason}</td>
              <td><Badge value={r.status} /></td>
              <td>{r.status === 'pending' && <div className="inline-actions">
                <button className="icon-btn success" onClick={() => reviewAdj(r.id, 'approved')}><Check size={17} /></button>
                <button className="icon-btn danger" onClick={() => reviewAdj(r.id, 'rejected')}><X size={17} /></button>
              </div>}</td>
            </tr>)}
          </tbody>
        </table>
        {!adjReqs.length && <Empty title="Chưa có đơn giải trình công" />}
      </div>
    </section>}
  </>;
}
