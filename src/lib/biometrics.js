import QRCode from 'qrcode';
import jsQR from 'jsqr';

let faceEnginePromise;

export async function loadFaceRecognitionModel() {
  if (!faceEnginePromise) {
    faceEnginePromise = import('@vladmandic/human')
      .then(async ({ Human }) => {
        const human = new Human({
          backend: 'webgl',
          modelBasePath: `${import.meta.env.BASE_URL}models/human/`,
          cacheModels: true,
          face: {
            enabled: true,
            detector: { maxDetected: 2, minConfidence: 0.7, rotation: true },
            mesh: { enabled: true },
            description: { enabled: true, minConfidence: 0.7 },
            emotion: { enabled: false },
            iris: { enabled: false }
          },
          body: { enabled: false },
          hand: { enabled: false },
          object: { enabled: false },
          gesture: { enabled: false }
        });
        await human.load();
        return human;
      })
      .catch(error => {
        faceEnginePromise = null;
        throw new Error(`Không tải được mô hình nhận diện khuôn mặt: ${error.message}`);
      });
  }
  return faceEnginePromise;
}

export async function detectFace(source) {
  if (!source) throw new Error('Không có nguồn hình ảnh để trích xuất khuôn mặt.');
  const srcW = source.videoWidth || source.naturalWidth || source.width || 0;
  const srcH = source.videoHeight || source.naturalHeight || source.height || 0;
  if (!srcW || !srcH) throw new Error('Khung hình chưa sẵn sàng.');

  const human = await loadFaceRecognitionModel();
  const { face = [] } = await human.detect(source);
  if (face.length === 0) return { status: 'no-face' };
  if (face.length !== 1) return { status: 'multiple-faces' };

  const detected = face[0];
  if (detected.boxScore < 0.7 || detected.faceScore < 0.7 || !detected.embedding?.length) {
    return { status: 'low-quality' };
  }

  const [x, y, width, height] = detected.box;
  const padding = Math.round(Math.max(width, height) * 0.12);
  const left = Math.max(0, Math.floor(x - padding));
  const top = Math.max(0, Math.floor(y - padding));
  const right = Math.min(srcW, Math.ceil(x + width + padding));
  const bottom = Math.min(srcH, Math.ceil(y + height + padding));
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth <= 0 || cropHeight <= 0) return { status: 'low-quality' };

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 220;
  thumbCanvas.height = 220;
  const tCtx = thumbCanvas.getContext('2d');
  const side = Math.max(cropWidth, cropHeight);
  const cropX = Math.max(0, left - Math.floor((side - cropWidth) / 2));
  const cropY = Math.max(0, top - Math.floor((side - cropHeight) / 2));
  const boundedSide = Math.min(side, srcW - cropX, srcH - cropY);
  tCtx.drawImage(source, cropX, cropY, boundedSide, boundedSide, 0, 0, 220, 220);
  const face_image = thumbCanvas.toDataURL('image/jpeg', 0.82);

  return {
    status: 'ready',
    descriptor: Array.from(detected.embedding),
    face_image,
    quality: Math.round(Math.min(detected.boxScore, detected.faceScore) * 100),
    faceBox: detected.box,
    frameSize: [srcW, srcH]
  };
}

export async function extractFaceDescriptor(source) {
  const result = await detectFace(source);
  if (result.status !== 'ready') {
    const messages = {
      'no-face': 'Không phát hiện khuôn mặt trong ảnh. Hãy nhìn thẳng vào camera và thử lại.',
      'multiple-faces': 'Phát hiện nhiều hơn một khuôn mặt. Vui lòng chỉ để một người trong khung hình.',
      'low-quality': 'Khuôn mặt chưa đủ rõ. Hãy tăng ánh sáng và đưa mặt gần camera hơn.'
    };
    throw new Error(messages[result.status] || 'Không thể nhận diện khuôn mặt.');
  }
  return result;
}

/**
 * Decodes a QR code from a live HTMLVideoElement, HTMLImageElement, or Canvas.
 * Tries jsQR first (cross-browser reliable) and native BarcodeDetector if available.
 */
export async function decodeQrFromSource(source) {
  if (!source) return null;
  const w = source.videoWidth || source.naturalWidth || source.width || 0;
  const h = source.videoHeight || source.naturalHeight || source.height || 0;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });
    if (code?.data) return code.data.trim();
  } catch {}

  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
      const results = await detector.detect(canvas);
      if (results?.[0]?.rawValue) return results[0].rawValue.trim();
    } catch {}
  }
  return null;
}

export async function generateQrDataUrl(text) {
  return QRCode.toDataURL(String(text || ''), {
    width: 220,
    margin: 1,
    color: { dark: '#10254b', light: '#ffffff' }
  });
}

export async function isWebAuthnAvailable() {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function randomChallenge() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function registerWebAuthnFingerprint(employee) {
  const available = await isWebAuthnAvailable();
  if (!available) {
    throw new Error('Thiết bị chưa kích hoạt Windows Hello / Touch ID. Hãy dùng chế độ cảm biến vân tay mô phỏng.');
  }
  const userId = new TextEncoder().encode(`th79-emp-${employee.id || employee.employee_code}`);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'TH79 HRM Biometrics', id: window.location.hostname },
      user: {
        id: userId,
        name: employee.employee_code || String(employee.id),
        displayName: employee.full_name || 'Nhân viên T&H 79'
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required'
      },
      timeout: 45000
    }
  });
  if (!cred) throw new Error('Không nhận được xác thực sinh trắc học từ thiết bị.');
  return {
    credential_id: cred.id,
    public_key: bufferToBase64Url(cred.rawId)
  };
}

export async function verifyWebAuthnFingerprint(allowCredentialIds = []) {
  const available = await isWebAuthnAvailable();
  if (!available) {
    throw new Error('Thiết bị chưa kích hoạt Windows Hello / Touch ID.');
  }
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      rpId: window.location.hostname,
      userVerification: 'required',
      allowCredentials: allowCredentialIds
        .filter(Boolean)
        .map(id => ({
          type: 'public-key',
          id: Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
        })),
      timeout: 45000
    }
  });
  if (!assertion) throw new Error('Xác thực vân tay bị hủy.');
  return { credential_id: assertion.id };
}

export function attendanceStatusLabel(status) {
  return ({
    present: 'Đúng giờ',
    late: 'Đi muộn',
    early_leave: 'Về sớm',
    late_and_early: 'Muộn & về sớm',
    absent: 'Vắng mặt',
    paid_leave: 'Nghỉ phép hưởng lương',
    unpaid_leave: 'Nghỉ không lương',
    holiday: 'Nghỉ lễ',
    weekend: 'Cuối tuần',
    empty: 'Chưa chấm công'
  }[status] || status || '—');
}

export function methodLabel(method) {
  return ({
    face: 'Khuôn mặt',
    badge: 'Bảng tên / QR',
    device: 'Máy chấm công',
    fingerprint: 'Dấu vân tay',
    manual: 'HR nhập tay',
    adjustment: 'Giải trình',
    leave: 'Đơn nghỉ phép'
  }[method] || method || '—');
}
