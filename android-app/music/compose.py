"""RobinTHood background theme: an original chiptune loop.

Original composition (Claude, Oct 31 2026), in a retro adventure-game style:
pulse-wave lead, triangle bass, soft arpeggio, noise drums. D major, 132 BPM,
16 bars, loops seamlessly. Renders android-app/assets/theme.m4a.

    python3 music/compose.py
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 132
EIGHTH = 60 / BPM / 2
BAR = 8  # eighths per bar
BARS = 16
TOTAL = int(round(BARS * BAR * EIGHTH * SR))

NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def freq(name):
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + NOTE[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


# Melody: (note, eighths). 'R' is a rest.
MELODY = [
    # A section
    ('A4', 2), ('F#4', 1), ('A4', 1), ('D5', 2), ('C#5', 1), ('B4', 1),
    ('C#5', 3), ('A4', 1), ('E5', 4),
    ('D5', 1), ('C#5', 1), ('B4', 2), ('F#4', 2), ('B4', 2),
    ('A4', 2), ('G4', 1), ('F#4', 1), ('G4', 2), ('B4', 2),
    ('A4', 2), ('F#4', 1), ('A4', 1), ('D5', 2), ('E5', 1), ('F#5', 1),
    ('E5', 2), ('C#5', 2), ('A4', 2), ('E5', 2),
    ('D5', 2), ('B4', 2), ('C#5', 2), ('E5', 2),
    ('D5', 6), ('R', 2),
    # B section
    ('B4', 1), ('D5', 1), ('G5', 2), ('F#5', 2), ('D5', 2),
    ('E5', 1), ('C#5', 1), ('A4', 2), ('C#5', 2), ('E5', 2),
    ('F#5', 3), ('E5', 1), ('C#5', 2), ('A4', 2),
    ('D5', 2), ('F#5', 2), ('B5', 4),
    ('G5', 2), ('F#5', 1), ('E5', 1), ('D5', 2), ('B4', 2),
    ('C#5', 2), ('D5', 1), ('E5', 1), ('A5', 4),
    ('G5', 2), ('F#5', 2), ('E5', 2), ('C#5', 2),
    ('D5', 4), ('A4', 2), ('R', 2),
]

# Chords per half bar: (root for bass, chord tones for arpeggio)
D, A, Bm, G, Fsm, Em = (
    ('D', ['D4', 'F#4', 'A4']), ('A', ['C#4', 'E4', 'A4']), ('B', ['D4', 'F#4', 'B4']),
    ('G', ['D4', 'G4', 'B4']), ('F#', ['C#4', 'F#4', 'A4']), ('E', ['E4', 'G4', 'B4']),
)
CHORDS = [
    D, D, A, A, Bm, Bm, G, G, D, D, A, A, G, A, D, D,
    G, G, A, A, Fsm, Fsm, Bm, Bm, G, G, A, A, Em, A, D, D,
]
BASS_OCT = {'D': 2, 'A': 2, 'B': 2, 'G': 2, 'F#': 2, 'E': 2}


def envelope(n, attack=0.004, release=0.04, sustain=0.75):
    env = np.ones(n) * sustain
    a = min(n, int(attack * SR))
    env[:a] = np.linspace(0, 1, a) if a else env[:a]
    d = min(n - a, int(0.05 * SR))
    env[a:a + d] = np.linspace(1, sustain, d)
    r = min(n, int(release * SR))
    env[n - r:] *= np.linspace(1, 0, r)
    return env


def pulse(f, n, duty):
    t = np.arange(n) / SR
    phase = (t * f) % 1.0
    return np.where(phase < duty, 1.0, -1.0)


def triangle(f, n):
    t = np.arange(n) / SR
    phase = (t * f) % 1.0
    return 4 * np.abs(phase - 0.5) - 1


def place(buf, start, sig):
    end = min(len(buf), start + len(sig))
    buf[start:end] += sig[: end - start]


def render():
    lead = np.zeros(TOTAL)
    pos = 0
    for note, length in MELODY:
        n = int(length * EIGHTH * SR)
        if note != 'R':
            f = freq(note)
            t = np.arange(n) / SR
            vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.18) * 4, 0, 1)
            phase = np.cumsum(f * vib / SR) % 1.0
            sig = np.where(phase < 0.25, 1.0, -1.0)
            place(lead, pos, sig * envelope(n, release=0.05))
        pos += n

    bass = np.zeros(TOTAL)
    arp = np.zeros(TOTAL)
    half = BAR // 2
    for i, (root, tones) in enumerate(CHORDS):
        base = i * half
        for k in range(half):  # eighth-note octave bounce
            n = int(EIGHTH * SR)
            octave = BASS_OCT[root] + (k % 2)
            sig = triangle(freq(f'{root}{octave}'), n) * envelope(n, release=0.03, sustain=0.9)
            place(bass, int((base + k) * EIGHTH * SR), sig)
        for k in range(half * 2):  # sixteenth-note arpeggio
            n = int(EIGHTH / 2 * SR)
            f = freq(tones[k % 3][:-1] + str(int(tones[k % 3][-1]) + 1))
            sig = pulse(f, n, 0.125) * envelope(n, release=0.02, sustain=0.4)
            place(arp, int((base + k / 2) * EIGHTH * SR), sig)

    drums = np.zeros(TOTAL)
    rng = np.random.default_rng(7)
    for beat in range(BARS * 4):
        start = int(beat * 2 * EIGHTH * SR)
        if beat % 2 == 0:  # kick
            n = int(0.12 * SR)
            t = np.arange(n) / SR
            f = 120 * np.exp(-t * 25) + 45
            sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
            place(drums, start, sig * 0.9)
        else:  # snare
            n = int(0.1 * SR)
            t = np.arange(n) / SR
            place(drums, start, rng.uniform(-1, 1, n) * np.exp(-t * 30) * 0.45)
        n = int(0.03 * SR)  # off-beat hat
        t = np.arange(n) / SR
        place(drums, start + int(EIGHTH * SR), rng.uniform(-1, 1, n) * np.exp(-t * 120) * 0.2)

    mix = 0.30 * lead + 0.34 * bass + 0.08 * arp + 0.28 * drums
    # gentle low-pass to soften the square edges
    kernel = np.ones(6) / 6
    mix = np.convolve(mix, kernel, mode='same')
    mix = mix / np.max(np.abs(mix)) * 0.7
    return mix


def main():
    here = Path(__file__).resolve().parent
    wav_path = here / 'theme.wav'
    out = here.parent / 'assets' / 'theme.m4a'
    audio = render()
    pcm = (audio * 32767).astype(np.int16)
    with wave.open(str(wav_path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav_path), '-c:a', 'aac', '-b:a', '96k', str(out)], check=True)
    wav_path.unlink()
    print(f'{out} ({len(audio) / SR:.1f}s)')


if __name__ == '__main__':
    main()
