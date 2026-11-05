/**
 * A tiny silent WAV. Playing it inside the PRESS START tap "unlocks" each
 * audio player on iPhone, so later songs can start without another tap.
 */
export function silentWavBytes(durationSeconds = 0.05, sampleRate = 8000): Uint8Array {
  const samples = Math.max(1, Math.round(durationSeconds * sampleRate));
  const dataSize = samples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  write(36, 'data');
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buffer); // samples are already zero
}

export function silentWavDataUri(): string {
  let binary = '';
  for (const byte of silentWavBytes()) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
