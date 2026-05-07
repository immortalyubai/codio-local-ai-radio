const sampleRate = 44100;

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function envelope(position, total) {
  const fadeSamples = Math.min(sampleRate * 0.08, total / 2);
  if (position < fadeSamples) return position / fadeSamples;
  if (position > total - fadeSamples) return (total - position) / fadeSamples;
  return 1;
}

export function createToneWav({
  durationSeconds = 2,
  frequency = 440,
  secondaryFrequency = 0,
  volume = 0.28,
  pulse = false
}) {
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let sample = 0; sample < totalSamples; sample += 1) {
    const time = sample / sampleRate;
    const wobble = pulse ? 1 + Math.sin(time * Math.PI * 2 * 0.9) * 0.04 : 1;
    const primary = Math.sin(Math.PI * 2 * frequency * wobble * time);
    const secondary = secondaryFrequency
      ? Math.sin(Math.PI * 2 * secondaryFrequency * time) * 0.45
      : 0;
    const softNoise = Math.sin(Math.PI * 2 * 82 * time) * 0.08;
    const value = (primary + secondary + softNoise) * volume * envelope(sample, totalSamples);
    view.setInt16(44 + sample * 2, Math.max(-1, Math.min(1, value)) * 32767, true);
  }

  return buffer;
}

export function hostIntroWav(segment = "opening") {
  const presets = {
    opening: { durationSeconds: 3.2, frequency: 220, secondaryFrequency: 330, pulse: true },
    weather: { durationSeconds: 2.6, frequency: 260, secondaryFrequency: 390, pulse: true },
    break1: { durationSeconds: 2.7, frequency: 246.94, secondaryFrequency: 370, pulse: true },
    break2: { durationSeconds: 2.7, frequency: 233.08, secondaryFrequency: 349.23, pulse: true },
    closing: { durationSeconds: 2.9, frequency: 196, secondaryFrequency: 294, pulse: true }
  };

  return createToneWav(presets[segment] ?? presets.opening);
}

export function musicWav(trackId = "morning-signal") {
  const presets = {
    "morning-signal": { durationSeconds: 8, frequency: 174, secondaryFrequency: 261.63, volume: 0.22 },
    "city-light": { durationSeconds: 9, frequency: 146.83, secondaryFrequency: 220, volume: 0.24 },
    "midnight-window": { durationSeconds: 10, frequency: 130.81, secondaryFrequency: 196, volume: 0.2 },
    "late-coffee": { durationSeconds: 7.5, frequency: 196, secondaryFrequency: 246.94, volume: 0.2 }
  };

  return createToneWav(presets[trackId] ?? presets["morning-signal"]);
}
