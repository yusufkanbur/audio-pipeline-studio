# FFmpeg Pipeline UI

Yerel web arayüzü: dosyaları dinle, waveform gör, tek tek onayla, sonra klasörü toplu işle.

## Kurulum

```powershell
cd C:\Users\Test\ffmpeg-pipeline-ui
.\run.ps1
```

Uygulama: `http://127.0.0.1:5177`

## Özellikler

- Input klasöründen ses dosyalarını tarar.
- Dosya seçildiğinde oynatma ve waveform gösterir.
- Dosya bazlı `Approve/Unapprove` yapar.
- Seçili dosya için processed preview render eder.
- `Process Approved` veya `Process All` ile batch işler.
- Çıktıyı `Output Folder` altına aynı klasör yapısıyla yazar (`.wav`).

## FFmpeg çözümleme

Sıra:

1. `FFMPEG_PATH` env var
2. Sistem `PATH`
3. `imageio-ffmpeg` binary fallback

Opsiyonel:

```powershell
$env:FFMPEG_PATH = "C:\tools\ffmpeg\bin\ffmpeg.exe"
```

## İşleme presetleri

- `Music / Ambience`: High-pass + loudnorm + fade + limiter
- `SFX / One-shot`: (opsiyonel) silence trim + loudnorm + fade + limiter

## Not

- Onay listesi ve config: `data/state.json`
- Preview dosyaları: `data/temp`
