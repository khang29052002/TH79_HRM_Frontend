import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck2, CalendarDays, Camera, Check, CheckCircle2, Clock3, Download,
  Edit3, FileSpreadsheet, Fingerprint, IdCard, Maximize2, Plus, QrCode, RefreshCw, ScanFace,
  Search, ShieldCheck, Trash2, Upload, UserCheck, Users, X
} from 'lucide-react';
import { api, apiUrl, qs } from '../lib/api';
import { Badge, Empty, Loading, Modal, PageHeader, StatCard, Toast } from '../components/ui';
import { fmtDate, initials } from '../lib/format';
import { useAuth } from '../hooks/useAuth';
import BiometricScanner from '../components/BiometricScanner';
import AttendanceImport from '../components/AttendanceImport';
import EmployeeBadgeCard from '../components/EmployeeBadgeCard';
import {
  attendanceStatusLabel, extractFaceDescriptor, isWebAuthnAvailable,
  methodLabel, registerWebAuthnFingerprint
} from '../lib/biometrics';
import {isValidDate,isValidNumber,isValidTime} from '../lib/validation';

export default function Attendance() {
  const { has } = useAuth();
  const canManage = has('attendance.manage');
  const [tab, setTab] = useState('terminal');
  const [overview, setOverview] = useState(null);
  const [biometrics, setBiometrics] = useState([]);
  const [lookups, setLookups] = useState({ branches: [], departments: [] });
  const [toast, setToast] = useState(null);

  // Timesheet state
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tsFilter, setTsFilter] = useState({ branch_id: '', department_id: '', q: '' });
  const [timesheet, setTimesheet] = useState(null);
  const [tsView, setTsView] = useState('summary');
  const [tsDetailRow, setTsDetailRow] = useState(null);

  // Shifts & Holidays
  const [holidays, setHolidays] = useState([]);
  const [openShift, setOpenShift] = useState(false);
  const [openHoliday, setOpenHoliday] = useState(false);

  // Adjustments
  const [adjustments, setAdjustments] = useState([]);

  // Enrollment & Manual modals
  const [bioQuery, setBioQuery] = useState('');
  const [enrollTarget, setEnrollTarget] = useState(null); // { emp, mode: 'face'|'badge'|'fingerprint' }
  const [manualModal, setManualModal] = useState(false);

  const notify = (message, tone = 'success') => setToast({ message, tone, key: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const loadCore = async () => {
    const [ov, bio, look] = await Promise.all([
      api('/attendance/overview'),
      api('/attendance/biometrics'),
      api('/employees/lookups')
    ]);
    setOverview(ov);
    setBiometrics(bio.items || []);
    setLookups(look);
  };

  const loadTimesheet = async () => {
    const r = await api(`/attendance/timesheet${qs({ month, year, ...tsFilter })}`);
    setTimesheet(r);
  };

  const loadSettings = async () => {
    const [h, adj] = await Promise.all([
      api('/attendance/holidays'),
      api('/attendance/adjustments')
    ]);
    setHolidays(h.items || []);
    setAdjustments(adj.items || []);
  };

  useEffect(() => {
    loadCore().catch(e => notify(e.message, 'error'));
    loadSettings().catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'timesheet') loadTimesheet().catch(e => notify(e.message, 'error'));
    if (tab === 'shifts' || tab === 'adjustments') loadSettings().catch(() => {});
  }, [tab, month, year, tsFilter.branch_id, tsFilter.department_id]);

  if (!overview) return <Loading />;

  const s = overview.stats || {};
  const filteredBios = biometrics.filter(b =>
    !bioQuery ||
    String(b.full_name || '').toLowerCase().includes(bioQuery.toLowerCase()) ||
    String(b.employee_code || '').toLowerCase().includes(bioQuery.toLowerCase())
  );

  const reviewAdjustment = async (id, status) => {
    try {
      await api(`/attendance/adjustments/${id}/review`, { method: 'POST', body: JSON.stringify({ status }) });
      notify(status === 'approved' ? 'Đã duyệt giải trình và cập nhật bảng công.' : 'Đã từ chối đơn giải trình.');
      await Promise.all([loadSettings(), loadCore()]);
    } catch (e) { notify(e.message, 'error'); }
  };

  const deleteShift = async id => {
    if (!confirm('Xóa ca làm việc này?')) return;
    try {
      await api(`/attendance/shifts/${id}`, { method: 'DELETE' });
      notify('Đã xóa ca làm việc.');
      await loadCore();
    } catch (e) { notify(e.message, 'error'); }
  };

  const deleteHoliday = async id => {
    try {
      await api(`/attendance/holidays/${id}`, { method: 'DELETE' });
      notify('Đã xóa ngày lễ.');
      await loadSettings();
    } catch (e) { notify(e.message, 'error'); }
  };

  const pendingAdjCount = adjustments.filter(a => a.status === 'pending').length;

  return <>
    {toast && <Toast key={toast.key} message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}

    <PageHeader
      title="Chấm công thông minh đa phương thức"
      subtitle="Quét khuôn mặt, quét bảng tên QR/Barcode, dấu vân tay, bảng công tháng và đồng bộ tiền lương."
      actions={<>
        <Link className="btn ghost" to="/kiosk"><Maximize2 size={16} /> Mở Kiosk toàn màn hình</Link>
        {canManage && <button className="btn primary" onClick={() => setManualModal(true)}><Plus size={16} /> Chấm công thủ công</button>}
      </>}
    />

    <div className="stats-grid six">
      <StatCard icon={Users} label="Nhân sự" value={s.total_employees || 0} detail="Đang hoạt động" />
      <StatCard icon={UserCheck} label="Đã check-in" value={s.checked_in || 0} detail={`Đúng giờ: ${s.on_time || 0}`} tone="green" />
      <StatCard icon={Clock3} label="Đi muộn" value={s.late || 0} detail="Hôm nay" tone="amber" />
      <StatCard icon={CheckCircle2} label="Đã tan ca" value={s.checked_out || 0} detail={`Nghỉ phép: ${s.on_leave || 0}`} tone="cyan" />
      <StatCard icon={ScanFace} label="Mẫu khuôn mặt" value={`${s.face_enrolled || 0}/${s.total_employees || 0}`} detail="Đã đăng ký Face ID" tone="violet" />
      <StatCard icon={Fingerprint} label="Mẫu vân tay" value={`${s.fingerprint_enrolled || 0}/${s.total_employees || 0}`} detail="Đã đăng ký vân tay" tone="blue" />
    </div>

    <div className="attendance-tabs" role="tablist">
      <button type="button" className={tab === 'terminal' ? 'active' : ''} onClick={() => setTab('terminal')}>
        <ScanFace size={16} /> Máy chấm công
      </button>
      <button type="button" className={tab === 'timesheet' ? 'active' : ''} onClick={() => setTab('timesheet')}>
        <CalendarDays size={16} /> Bảng công tháng
      </button>
      <button type="button" className={tab === 'biometrics' ? 'active' : ''} onClick={() => setTab('biometrics')}>
        <IdCard size={16} /> Khuôn mặt, Bảng tên & Vân tay
      </button>
      <button type="button" className={tab === 'shifts' ? 'active' : ''} onClick={() => setTab('shifts')}>
        <CalendarCheck2 size={16} /> Ca làm việc & Ngày lễ
      </button>
      <button type="button" className={tab === 'adjustments' ? 'active' : ''} onClick={() => setTab('adjustments')}>
        <Edit3 size={16} /> Giải trình công {pendingAdjCount > 0 && <em className="tab-pill">{pendingAdjCount}</em>}
      </button>
      {canManage && <button type="button" className={tab === 'device-import' ? 'active' : ''} onClick={() => setTab('device-import')}>
        <FileSpreadsheet size={16} /> Nhập file máy chấm công
      </button>}
    </div>

    {tab === 'terminal' && <div className="attendance-terminal-grid">
      <section className="card attendance-scanner-card">
        <div className="card-head">
          <div>
            <h3>Thiết bị chấm công trực tuyến</h3>
            <p>Chọn phương thức Quét khuôn mặt, Bảng tên QR hoặc Dấu vân tay</p>
          </div>
        </div>
        <div className="scanner-card-body">
          <BiometricScanner
            shifts={overview.shifts || []}
            biometrics={biometrics}
            onSuccess={() => loadCore()}
          />
        </div>
      </section>

      <section className="card attendance-feed-card">
        <div className="card-head">
          <div>
            <h3>Nhật ký chấm công hôm nay</h3>
            <p>{overview.date} · {(overview.recentRecords || []).length} lượt ghi nhận</p>
          </div>
          <button type="button" className="icon-button" onClick={loadCore} title="Làm mới"><RefreshCw size={16} /></button>
        </div>
        <div className="attendance-feed-list">
          {(overview.recentRecords || []).map(r => <div key={r.id} className="attendance-feed-row">
            <span className="mini-avatar">{initials(r.employee?.full_name)}</span>
            <div className="feed-copy">
              <strong>{r.employee?.full_name || `NV #${r.employee_id}`}</strong>
              <small>
                {r.employee?.employee_code} · {methodLabel(r.check_in_method)}
                {r.check_in_confidence ? ` (${r.check_in_confidence}%)` : ''}
              </small>
            </div>
            <div className="feed-times">
              <span>Vào: <b>{r.check_in_label || '—'}</b></span>
              <span>Ra: <b>{r.check_out_label || '—'}</b></span>
            </div>
            <Badge
              value={attendanceStatusLabel(r.status)}
              tone={r.status === 'present' ? 'success' : r.status === 'late' || r.status === 'late_and_early' ? 'warning' : 'neutral'}
            />
          </div>)}
          {!(overview.recentRecords || []).length && <Empty title="Chưa có lượt chấm công hôm nay" detail="Hãy thử quét khuôn mặt, bảng tên QR hoặc vân tay ở bên trái." />}
        </div>
      </section>
    </div>}

    {tab === 'device-import' && canManage && <AttendanceImport onComplete={loadCore} />}

    {tab === 'timesheet' && <section className="card">
      <div className="card-head">
        <div>
          <h3>Bảng chấm công tháng {String(month).padStart(2, '0')}/{year}</h3>
          <p>Công chuẩn tham chiếu: {timesheet?.standardWorkDays || 26} ngày · Tổng hợp công thực tế, phép năm hưởng lương, nghỉ lễ và tăng ca</p>
        </div>
        <div className="page-actions">
          <div className="ts-view-switch" role="group" aria-label="Chế độ xem bảng công">
            <button type="button" className={tsView === 'summary' ? 'active' : ''} onClick={() => setTsView('summary')}>Tổng hợp gọn</button>
            <button type="button" className={tsView === 'matrix' ? 'active' : ''} onClick={() => setTsView('matrix')}>Bảng 31 ngày</button>
          </div>
          <a className="btn ghost small" href={apiUrl(`/attendance/timesheet/export${qs({ month, year, ...tsFilter })}`)}>
            <Download size={15} /> Xuất Excel
          </a>
          <button type="button" className="btn primary small" onClick={loadTimesheet}><RefreshCw size={15} /> Tải lại</button>
        </div>
      </div>

      <div className="timesheet-filters">
        <div className="search-box">
          <Search size={16} />
          <input
            value={tsFilter.q}
            onChange={e => setTsFilter({ ...tsFilter, q: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && loadTimesheet()}
            placeholder="Tìm tên hoặc mã nhân viên..."
          />
        </div>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}>
          {[year - 1, year, year + 1].map(y => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        <select value={tsFilter.branch_id} onChange={e => setTsFilter({ ...tsFilter, branch_id: e.target.value })}>
          <option value="">Tất cả chi nhánh</option>
          {(lookups.branches || []).map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
        </select>
      </div>

      {!timesheet ? <Loading /> : tsView === 'summary' ? <div className="table-wrap">
        <table className="ts-summary-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Công làm</th>
              <th>Nghỉ phép / Lễ</th>
              <th>Đi muộn</th>
              <th>OT (giờ)</th>
              <th>Tổng công tính lương</th>
              <th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {timesheet.items.map(row => {
              const std = timesheet.standardWorkDays || 26;
              const pct = Math.min(100, Math.round(((Number(row.payable_work_days) || 0) / std) * 100));
              return <tr key={row.employee_id}>
                <td>
                  <button type="button" className="person-cell person-link" onClick={() => setTsDetailRow(row)}>
                    <span className="mini-avatar">{initials(row.full_name)}</span>
                    <span><strong>{row.full_name}</strong><small>{row.employee_code} · {row.branch_name || 'Chưa phân chi nhánh'}</small></span>
                  </button>
                </td>
                <td><strong>{row.present_days}</strong> <span className="muted-inline">ngày</span></td>
                <td>Phép: <strong>{row.paid_leave_days}</strong>{row.unpaid_leave_days > 0 ? <> · Không lương: <strong>{row.unpaid_leave_days}</strong></> : null} · Lễ: <strong>{row.holiday_days}</strong></td>
                <td>{row.late_count > 0 ? <span className="badge warning">{row.late_count} lần</span> : <span className="badge success">Đúng giờ</span>}</td>
                <td>{row.overtime_hours > 0 ? <strong>{row.overtime_hours}h</strong> : '0h'}</td>
                <td>
                  <div className="ts-progress-cell">
                    <div><strong>{row.payable_work_days}</strong> / {std} ngày</div>
                    <div className="ts-progress-bar"><span style={{ width: `${pct}%` }} /></div>
                  </div>
                </td>
                <td>
                  <button type="button" className="btn ghost small" onClick={() => setTsDetailRow(row)}>
                    <CalendarDays size={14} /> Xem lịch công
                  </button>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {!timesheet.items.length && <Empty title="Không có dữ liệu bảng công" />}
      </div> : <div className="table-wrap">
        <table className="timesheet-table">
          <thead>
            <tr>
              <th className="sticky-col">Nhân viên</th>
              {Array.from({ length: timesheet.daysInMonth }, (_, i) => i + 1).map(d => (
                <th key={d} className="day-col">{d}</th>
              ))}
              <th>Công làm</th>
              <th>Phép</th>
              <th>Lễ</th>
              <th>Muộn</th>
              <th>OT (h)</th>
              <th className="sticky-right">Tổng công</th>
            </tr>
          </thead>
          <tbody>
            {timesheet.items.map(row => <tr key={row.employee_id}>
              <td className="sticky-col">
                <strong>{row.full_name}</strong>
                <small className="block">{row.employee_code} · {row.branch_name || '—'}</small>
              </td>
              {Array.from({ length: timesheet.daysInMonth }, (_, i) => i + 1).map(d => {
                const c = row.days[d] || {};
                const cls = c.type === 'weekend' ? 'ts-wk'
                  : c.type === 'holiday' ? 'ts-hol'
                  : c.type === 'paid_leave' ? 'ts-leave'
                  : c.type === 'late' || c.type === 'late_and_early' ? 'ts-late'
                  : c.type === 'present' || c.type === 'early_leave' ? 'ts-ok'
                  : 'ts-empty';
                const label = c.type === 'weekend' ? 'CN'
                  : c.type === 'holiday' ? 'L'
                  : c.type === 'paid_leave' ? 'P'
                  : c.type === 'unpaid_leave' ? 'KP'
                  : c.unit ? c.unit : '·';
                const title = c.check_in ? `Vào ${c.check_in} - Ra ${c.check_out || '?'}` : (c.label || '');
                return <td key={d} className={`day-cell ${cls}`} title={title}>{label}</td>;
              })}
              <td className="center-cell">{row.present_days}</td>
              <td className="center-cell">{row.paid_leave_days}</td>
              <td className="center-cell">{row.holiday_days}</td>
              <td className="center-cell">{row.late_count}</td>
              <td className="center-cell">{row.overtime_hours}</td>
              <td className="center-cell sticky-right"><strong>{row.payable_work_days}</strong></td>
            </tr>)}
          </tbody>
        </table>
        {!timesheet.items.length && <Empty title="Không có dữ liệu bảng công" />}
      </div>}
    </section>}

    {tab === 'biometrics' && <section className="card">
      <div className="card-head bio-card-head">
        <div>
          <h3>Hồ sơ sinh trắc học & Bảng tên nhân viên</h3>
          <p>Đăng ký khuôn mặt bằng mô hình mới, cấp bảng tên QR và đăng ký dấu vân tay. Mẫu khuôn mặt cũ cần đăng ký lại.</p>
        </div>
        <div className="search-box bio-search-box">
          <Search size={16} />
          <input value={bioQuery} onChange={e => setBioQuery(e.target.value)} placeholder="Tìm nhân viên..." />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Chi nhánh / Chức vụ</th>
              <th>Khuôn mặt (Face ID)</th>
              <th>Bảng tên / QR</th>
              <th>Dấu vân tay</th>
              <th>Thao tác đăng ký</th>
            </tr>
          </thead>
          <tbody>
            {filteredBios.map(b => <tr key={b.employee_id}>
              <td>
                <div className="person-cell">
                  {b.face_image
                    ? <img className="mini-avatar-img" src={b.face_image} alt={b.full_name} />
                    : <span className="mini-avatar">{initials(b.full_name)}</span>}
                  <span><strong>{b.full_name}</strong><small>{b.employee_code}</small></span>
                </div>
              </td>
              <td><strong>{b.position_name || '—'}</strong><small className="block">{b.branch_name || '—'}</small></td>
              <td>
                <Badge value={b.face_enrolled ? `Đã đăng ký (${b.face_quality || 95}%)` : 'Chưa đăng ký'} tone={b.face_enrolled ? 'success' : 'neutral'} />
              </td>
              <td>
                <span className="badge success">{b.badge_code}</span>
              </td>
              <td>
                <Badge value={b.fingerprint_enrolled ? (b.fingerprint_label || 'Đã đăng ký') : 'Chưa đăng ký'} tone={b.fingerprint_enrolled ? 'success' : 'neutral'} />
              </td>
              <td>
                <div className="row-actions">
                  {canManage && <button type="button" className="btn ghost small" onClick={() => setEnrollTarget({ emp: b, mode: 'face' })}><ScanFace size={14} /> Khuôn mặt</button>}
                  <button type="button" className="btn ghost small" onClick={() => setEnrollTarget({ emp: b, mode: 'badge' })}><QrCode size={14} /> Bảng tên QR</button>
                  {canManage && <button type="button" className="btn ghost small" onClick={() => setEnrollTarget({ emp: b, mode: 'fingerprint' })}><Fingerprint size={14} /> Vân tay</button>}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    {tab === 'shifts' && <div className="two-col-grid">
      <section className="card">
        <div className="card-head">
          <div><h3>Ca làm việc</h3><p>Cấu hình giờ vào/ra, phút đi muộn và hệ số OT</p></div>
          {canManage && <button type="button" className="btn primary small" onClick={() => setOpenShift(true)}><Plus size={15} /> Thêm ca</button>}
        </div>
        <div className="simple-list">
          {(overview.shifts || []).map(s => <div key={s.id}>
            <span>
              <strong>{s.shift_name} ({s.shift_code}) {Number(s.is_default) === 1 && <em className="nav-new">MẶC ĐỊNH</em>}</strong>
              <small>{s.start_time} – {s.end_time} · {s.work_hours}h công · Cho phép muộn {s.grace_minutes}p · OT ×{s.overtime_multiplier}</small>
            </span>
            {canManage && Number(s.is_default) !== 1 && <button type="button" className="icon-btn danger" onClick={() => deleteShift(s.id)}><Trash2 size={15} /></button>}
          </div>)}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div><h3>Ngày lễ hưởng lương</h3><p>Tự động cộng công lễ khi tổng hợp bảng công tháng</p></div>
          {canManage && <button type="button" className="btn primary small" onClick={() => setOpenHoliday(true)}><Plus size={15} /> Thêm ngày lễ</button>}
        </div>
        <div className="simple-list">
          {holidays.map(h => <div key={h.id}>
            <span><strong>{h.holiday_name}</strong><small>{fmtDate(h.holiday_date)} · {Number(h.is_paid) === 1 ? 'Hưởng nguyên lương' : 'Nghỉ không lương'}</small></span>
            {canManage && <button type="button" className="icon-btn danger" onClick={() => deleteHoliday(h.id)}><Trash2 size={15} /></button>}
          </div>)}
          {!holidays.length && <Empty title="Chưa có ngày lễ" />}
        </div>
      </section>
    </div>}

    {tab === 'adjustments' && <section className="card">
      <div className="card-head">
        <div><h3>Đơn giải trình chấm công</h3><p>Nhân viên gửi bổ sung giờ vào/ra khi quên chấm công hoặc gặp sự cố thiết bị</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nhân viên</th><th>Ngày công</th><th>Giờ đề nghị</th><th>Lý do</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {adjustments.map(a => <tr key={a.id}>
              <td><strong>{a.employee_name}</strong><small className="block">{a.employee_code}</small></td>
              <td>{fmtDate(a.work_date)}</td>
              <td>{a.requested_check_in} – {a.requested_check_out}</td>
              <td>{a.reason}</td>
              <td><Badge value={a.status} /></td>
              <td>
                {a.status === 'pending' && canManage && <div className="inline-actions">
                  <button type="button" className="icon-btn success" onClick={() => reviewAdjustment(a.id, 'approved')}><Check size={16} /></button>
                  <button type="button" className="icon-btn danger" onClick={() => reviewAdjustment(a.id, 'rejected')}><X size={16} /></button>
                </div>}
              </td>
            </tr>)}
          </tbody>
        </table>
        {!adjustments.length && <Empty title="Chưa có đơn giải trình công" />}
      </div>
    </section>}

    <Modal open={Boolean(enrollTarget)} onClose={() => setEnrollTarget(null)} title={
      enrollTarget?.mode === 'face' ? `Đăng ký khuôn mặt — ${enrollTarget?.emp?.full_name}`
        : enrollTarget?.mode === 'badge' ? `Bảng tên / Thẻ nhân viên QR — ${enrollTarget?.emp?.full_name}`
          : `Đăng ký dấu vân tay — ${enrollTarget?.emp?.full_name}`
    } wide>
      {enrollTarget && <EnrollmentDialog
        emp={enrollTarget.emp}
        mode={enrollTarget.mode}
        canManage={canManage}
        onDone={async msg => {
          setEnrollTarget(null);
          notify(msg);
          await loadCore();
        }}
      />}
    </Modal>

    <Modal open={openShift} onClose={() => setOpenShift(false)} title="Thêm ca làm việc">
      <ShiftForm done={async () => { setOpenShift(false); notify('Đã thêm ca làm việc.'); await loadCore(); }} />
    </Modal>

    <Modal open={openHoliday} onClose={() => setOpenHoliday(false)} title="Thêm ngày lễ">
      <HolidayForm done={async () => { setOpenHoliday(false); notify('Đã thêm ngày lễ.'); await loadSettings(); }} />
    </Modal>

    <Modal open={manualModal} onClose={() => setManualModal(false)} title="Chấm công / Bổ sung công thủ công">
      <ManualRecordForm employees={biometrics} shifts={overview.shifts || []} done={async () => { setManualModal(false); notify('Đã cập nhật dữ liệu chấm công.'); await loadCore(); }} />
    </Modal>

    <Modal open={Boolean(tsDetailRow)} onClose={() => setTsDetailRow(null)} title={`Lịch chấm công tháng ${String(month).padStart(2, '0')}/${year} — ${tsDetailRow?.full_name || ''}`} wide>
      {tsDetailRow && timesheet && <TimesheetCalendarModal row={tsDetailRow} month={month} year={year} daysInMonth={timesheet.daysInMonth} standardWorkDays={timesheet.standardWorkDays || 26} />}
    </Modal>
  </>;
}

function TimesheetCalendarModal({ row, month, year, daysInMonth, standardWorkDays }) {
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 0 = Mon
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return <div className="ts-cal-wrap">
    <div className="ts-cal-summary">
      <span>Công làm: <strong>{row.present_days}</strong></span>
      <span>Nghỉ có phép: <strong>{row.paid_leave_days}</strong></span>
      {row.unpaid_leave_days > 0 && <span>Nghỉ không lương: <strong>{row.unpaid_leave_days}</strong></span>}
      <span>Nghỉ lễ: <strong>{row.holiday_days}</strong></span>
      <span>Đi muộn: <strong>{row.late_count} lần</strong></span>
      <span>OT: <strong>{row.overtime_hours}h</strong></span>
      <span>Tổng tính lương: <strong>{row.payable_work_days}/{standardWorkDays} ngày</strong></span>
    </div>

    <div className="ts-cal-weekdays">
      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(w => <div key={w}>{w}</div>)}
    </div>

    <div className="ts-cal-grid">
      {cells.map((d, idx) => {
        if (!d) return <div key={`empty-${idx}`} className="ts-cal-day empty" />;
        const c = row.days?.[d] || {};
        const cls = c.type === 'weekend' ? 'ts-wk'
          : c.type === 'holiday' ? 'ts-hol'
          : c.type === 'paid_leave' ? 'ts-leave'
          : c.type === 'unpaid_leave' ? 'ts-unpaid'
          : c.type === 'late' || c.type === 'late_and_early' ? 'ts-late'
          : c.type === 'present' || c.type === 'early_leave' ? 'ts-ok'
          : 'ts-empty';
        const statusText = c.type === 'weekend' ? 'Cuối tuần'
          : c.type === 'holiday' ? 'Nghỉ lễ'
          : c.type === 'paid_leave' ? (c.label || 'Nghỉ có phép')
          : c.type === 'unpaid_leave' ? (c.label || 'Nghỉ không lương')
          : c.check_in ? `${c.check_in} - ${c.check_out || '?'}`
          : (c.label || 'Chưa có công');
        return <div key={d} className={`ts-cal-day ${cls}`}>
          <div className="ts-cal-num">{d}{c.unit ? <em>{c.unit} công</em> : c.type === 'unpaid_leave' ? <em>0 công</em> : null}</div>
          <small>{statusText}</small>
        </div>;
      })}
    </div>

    <div className="ts-cal-legend">
      <span><i className="ts-ok" /> Đúng giờ</span>
      <span><i className="ts-late" /> Đi muộn / về sớm</span>
      <span><i className="ts-leave" /> Nghỉ phép</span>
      <span><i className="ts-hol" /> Nghỉ lễ</span>
      <span><i className="ts-wk" /> Cuối tuần</span>
    </div>
  </div>;
}

function EnrollmentDialog({ emp, mode, canManage, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [badgeCode, setBadgeCode] = useState(emp.badge_code || emp.employee_code || '');
  const [fingerLabel, setFingerLabel] = useState(emp.fingerprint_label || 'Ngón trỏ phải');
  const [webAuthnAvail, setWebAuthnAvail] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    isWebAuthnAvailable().then(setWebAuthnAvail);
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startCam = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err) {
      setError(err.message || 'Không thể mở Camera.');
    }
  };

  const enrollFaceFromSource = async source => {
    setBusy(true);
    setError('');
    try {
      const { descriptor, face_image, quality } = await extractFaceDescriptor(source);
      await api('/attendance/biometrics/enroll', {
        method: 'POST',
        body: JSON.stringify({ employee_id: emp.employee_id, method: 'face', descriptor, face_image, quality })
      });
      onDone(`Đã lưu mẫu khuôn mặt cho ${emp.full_name} (chất lượng ${quality}%).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadFacePhoto = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      await enrollFaceFromSource(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const saveBadge = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/attendance/biometrics/enroll', {
        method: 'POST',
        body: JSON.stringify({ employee_id: emp.employee_id, method: 'badge', badge_code: badgeCode })
      });
      onDone(`Đã cập nhật bảng tên ${badgeCode} cho ${emp.full_name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const enrollFingerprint = async (usePlatform = false) => {
    setBusy(true);
    setError('');
    try {
      let extra = {};
      if (usePlatform) {
        extra = await registerWebAuthnFingerprint({ id: emp.employee_id, employee_code: emp.employee_code, full_name: emp.full_name });
      }
      await api('/attendance/biometrics/enroll', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: emp.employee_id,
          method: 'fingerprint',
          finger_label: fingerLabel,
          ...extra
        })
      });
      onDone(`Đã đăng ký dấu vân tay (${fingerLabel}) cho ${emp.full_name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'face') {
    return <div className="form-stack">
      {error && <div className="form-error">{error}</div>}
      <div className="camera-viewport compact">
        <video ref={videoRef} muted playsInline style={{ display: cameraOn ? 'block' : 'none' }} />
        {!cameraOn && <div className="camera-standby">
          {emp.face_image
            ? <img src={emp.face_image} alt={emp.full_name} className="enrolled-face-preview" />
            : <ScanFace size={48} />}
          <strong>{emp.face_enrolled ? 'Đã có mẫu khuôn mặt' : 'Chưa có mẫu khuôn mặt'}</strong>
          <p>Mở camera để chụp mẫu mới hoặc tải ảnh chân dung rõ mặt lên.</p>
        </div>}
      </div>
      <div className="scanner-controls">
        {!cameraOn && <button type="button" className="btn ghost" onClick={startCam}><Camera size={16} /> Mở Camera</button>}
        {cameraOn && <button type="button" className="btn primary" disabled={busy} onClick={() => enrollFaceFromSource(videoRef.current)}><CheckCircle2 size={16} /> Chụp & Lưu mẫu mặt</button>}
        <label className="btn primary upload-btn">
          <Upload size={16} /> Tải ảnh chân dung
          <input type="file" accept="image/*" hidden onChange={uploadFacePhoto} />
        </label>
      </div>
    </div>;
  }

  if (mode === 'badge') {
    return <div className="form-stack">
      {error && <div className="form-error">{error}</div>}
      <EmployeeBadgeCard
        employee={emp}
        badgeCode={badgeCode}
        qrPayload={emp.qr_payload}
        faceImage={emp.face_image}
      />
      {canManage && <form className="badge-enroll-form" onSubmit={saveBadge}>
        <label>
          <span>Mã bảng tên / RFID / QR Code</span>
          <input value={badgeCode} onChange={e => setBadgeCode(e.target.value)} required />
        </label>
        <button className="btn primary" disabled={busy}>Lưu mã bảng tên</button>
      </form>}
    </div>;
  }

  return <div className="form-stack">
    {error && <div className="form-error">{error}</div>}
    <label>
      <span>Ngón tay đăng ký</span>
      <select value={fingerLabel} onChange={e => setFingerLabel(e.target.value)}>
        <option>Ngón trỏ phải</option>
        <option>Ngón cái phải</option>
        <option>Ngón trỏ trái</option>
        <option>Ngón cái trái</option>
      </select>
    </label>
    <div className="fingerprint-enroll-actions">
      <button type="button" className="btn primary" disabled={busy} onClick={() => enrollFingerprint(false)}>
        <Fingerprint size={16} /> {busy ? 'Đang lấy mẫu...' : 'Quét & Lưu mẫu vân tay (Cảm biến)'}
      </button>
      {webAuthnAvail && <button type="button" className="btn ghost" disabled={busy} onClick={() => enrollFingerprint(true)}>
        <ShieldCheck size={16} /> Đăng ký qua Windows Hello / Touch ID
      </button>}
    </div>
  </div>;
}

function ShiftForm({ done }) {
  const [f, setF] = useState({ shift_code: '', shift_name: '', start_time: '08:00', end_time: '17:30', work_hours: 8, grace_minutes: 10, overtime_multiplier: 1.5, is_default: false });
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    setErr('');
    if(!/^[A-Za-z0-9_-]{2,30}$/.test(String(f.shift_code||'').trim())){setErr('Mã ca phải có 2–30 ký tự chữ, số, gạch ngang hoặc gạch dưới.');return}
    if(String(f.shift_name||'').trim().length<2||String(f.shift_name).trim().length>100){setErr('Tên ca phải có từ 2 đến 100 ký tự.');return}
    if(!isValidTime(f.start_time)||!isValidTime(f.end_time)){setErr('Giờ bắt đầu hoặc kết thúc ca không hợp lệ.');return}
    if(f.start_time===f.end_time){setErr('Giờ kết thúc phải khác giờ bắt đầu.');return}
    if(Boolean(f.break_start)!==Boolean(f.break_end)){setErr('Cần nhập cả giờ bắt đầu và kết thúc nghỉ giữa ca.');return}
    if(f.break_start&&(!isValidTime(f.break_start)||!isValidTime(f.break_end))){setErr('Giờ nghỉ giữa ca không hợp lệ.');return}
    if(!isValidNumber(f.work_hours,{min:0.5,max:24})||Number(f.work_hours)*2%1!==0){setErr('Số giờ công phải từ 0,5 đến 24 và theo bước 0,5 giờ.');return}
    if(!isValidNumber(f.grace_minutes,{min:0,max:10,integer:true})){setErr('Thời gian cho phép đi muộn tối đa 10 phút (0–10 phút).');return}
    if(!isValidNumber(f.overtime_multiplier,{min:1,max:5})){setErr('Hệ số OT phải từ 1 đến 5.');return}
    try { await api('/attendance/shifts', { method: 'POST', body: JSON.stringify(f) }); done(); }
    catch (ex) { setErr(ex.message); }
  };
  return <form className="form-stack" onSubmit={submit}>
    {err && <div className="form-error">{err}</div>}
    <div className="two-col">
      <label>Mã ca<input required value={f.shift_code} onChange={e => setF({ ...f, shift_code: e.target.value })} placeholder="CA_TOI" /></label>
      <label>Tên ca làm việc<input required value={f.shift_name} onChange={e => setF({ ...f, shift_name: e.target.value })} placeholder="Ca tối" /></label>
    </div>
    <div className="two-col">
      <label>Giờ bắt đầu<input type="time" value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} /></label>
      <label>Giờ kết thúc<input type="time" value={f.end_time} onChange={e => setF({ ...f, end_time: e.target.value })} /></label>
    </div>
    <div className="three-col">
      <label>Số giờ công<input type="number" min="0.5" max="24" step="0.5" value={f.work_hours} onChange={e => setF({ ...f, work_hours: e.target.value })} /></label>
      <label>Cho phép muộn (tối đa 10p)<input type="number" min="0" max="10" step="1" value={f.grace_minutes} onChange={e => setF({ ...f, grace_minutes: e.target.value })} /></label>
      <label>Hệ số OT<input type="number" min="1" max="5" step="0.1" value={f.overtime_multiplier} onChange={e => setF({ ...f, overtime_multiplier: e.target.value })} /></label>
    </div>
    <label className="inline-toggle"><input type="checkbox" checked={f.is_default} onChange={e => setF({ ...f, is_default: e.target.checked })} /><span>Đặt làm ca mặc định</span></label>
    <button className="btn primary">Tạo ca làm việc</button>
  </form>;
}

function HolidayForm({ done }) {
  const [f, setF] = useState({ holiday_date: new Date().toISOString().slice(0, 10), holiday_name: '', is_paid: 1 });
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    try { await api('/attendance/holidays', { method: 'POST', body: JSON.stringify(f) }); done(); }
    catch (ex) { setErr(ex.message); }
  };
  return <form className="form-stack" onSubmit={submit}>
    {err && <div className="form-error">{err}</div>}
    <label>Ngày lễ<input type="date" required value={f.holiday_date} onChange={e => setF({ ...f, holiday_date: e.target.value })} /></label>
    <label>Tên ngày lễ<input required value={f.holiday_name} onChange={e => setF({ ...f, holiday_name: e.target.value })} placeholder="VD: Ngày Quốc khánh" /></label>
    <label>Chế độ lương<select value={f.is_paid} onChange={e => setF({ ...f, is_paid: Number(e.target.value) })}><option value={1}>Hưởng nguyên lương</option><option value={0}>Nghỉ không lương</option></select></label>
    <button className="btn primary">Thêm ngày lễ</button>
  </form>;
}

function ManualRecordForm({ employees, shifts, done }) {
  const [f, setF] = useState({
    employee_id: employees[0]?.employee_id || '',
    work_date: new Date().toISOString().slice(0, 10),
    shift_id: shifts[0]?.id || 1,
    check_in_label: '08:00',
    check_out_label: '17:30',
    note: ''
  });
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    setErr('');
    if(!isValidDate(f.work_date)){setErr('Ngày chấm công không hợp lệ.');return}
    if(!isValidTime(f.check_in_label)||(f.check_out_label&&!isValidTime(f.check_out_label))){setErr('Giờ vào hoặc giờ ra không hợp lệ.');return}
    if(f.check_out_label&&f.check_out_label<=f.check_in_label){setErr('Giờ ra phải sau giờ vào.');return}
    try { await api('/attendance/records', { method: 'POST', body: JSON.stringify(f) }); done(); }
    catch (ex) { setErr(ex.message); }
  };
  return <form className="form-stack" onSubmit={submit}>
    {err && <div className="form-error">{err}</div>}
    <label>Nhân viên<select required value={f.employee_id} onChange={e => setF({ ...f, employee_id: e.target.value })}>
      {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.employee_code} · {e.full_name}</option>)}
    </select></label>
    <div className="two-col">
      <label>Ngày công<input type="date" required value={f.work_date} onChange={e => setF({ ...f, work_date: e.target.value })} /></label>
      <label>Ca làm việc<select value={f.shift_id} onChange={e => setF({ ...f, shift_id: e.target.value })}>
        {shifts.map(s => <option key={s.id} value={s.id}>{s.shift_name}</option>)}
      </select></label>
    </div>
    <div className="two-col">
      <label>Giờ vào<input type="time" required value={f.check_in_label} onChange={e => setF({ ...f, check_in_label: e.target.value })} /></label>
      <label>Giờ ra<input type="time" value={f.check_out_label} onChange={e => setF({ ...f, check_out_label: e.target.value })} /></label>
    </div>
    <label>Ghi chú<textarea rows={2} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Bổ sung công hoặc điều chỉnh giờ..." /></label>
    <button className="btn primary">Lưu dữ liệu công</button>
  </form>;
}
