# Audio Pipeline Studio

English and Japanese documentation are shown directly on this GitHub page.

[English](#english) | [日本語](#日本語) | [日本語 only](README.ja.md)

---

## English

Audio Pipeline Studio is a local web UI for reviewing, approving, previewing, and batch-processing audio files with FFmpeg.

It is designed for game-audio and production workflows where you want to inspect waveforms, compare original and processed audio, adjust fades/trims, and render approved files into a normalized output folder.

### Documentation Languages

This repository welcomes visitors with both English and Japanese documentation in the root `README.md`.

- English: [README.md#english](#english)
- Japanese: [README.md#日本語](#日本語)
- Japanese-only file: [README.ja.md](README.ja.md)

The documentation language does not change your audio processing settings or FFmpeg behavior.

### Features

- Scan an input folder for `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`, and `.aac` files.
- Review audio with waveform visualization.
- Approve or unapprove files before batch rendering.
- Render processed previews before committing a batch.
- Process approved files or all scanned files.
- Preserve input folder structure under the output folder.
- Run local-only FFmpeg processing through a Flask UI.
- Upload and process a single audio file through the browser.
- Switch the application UI between English and Japanese.

### Requirements

- Python 3.10 or newer
- FFmpeg and FFprobe available through one of these options:
  - `FFMPEG_PATH` / `FFPROBE_PATH` environment variables
  - system `PATH`
  - `imageio-ffmpeg` fallback for FFmpeg

### Quick Start

```powershell
git clone https://github.com/yusufkanbur/audio-pipeline-studio.git
cd audio-pipeline-studio
.\run.ps1
```

Open:

```text
http://127.0.0.1:5177
```

### Configuration

The app stores local runtime state under `data/state.json`, which is intentionally ignored by Git.

Optional environment variables:

```powershell
$env:APS_INPUT_DIR = "C:\path\to\audio\input"
$env:APS_OUTPUT_DIR = "C:\path\to\audio\output"
$env:APS_HOST = "127.0.0.1"
$env:APS_PORT = "5177"
$env:FFMPEG_PATH = "C:\tools\ffmpeg\bin\ffmpeg.exe"
$env:FFPROBE_PATH = "C:\tools\ffmpeg\bin\ffprobe.exe"
```

Without `APS_INPUT_DIR` and `APS_OUTPUT_DIR`, the app defaults to local project folders named `input` and `output`.

### Processing Presets

- `Music / Ambience`: high-pass, loudness normalization, fades, limiter.
- `SFX / One-shot`: optional trim, loudness normalization, fades, limiter.

### Security Model

Audio Pipeline Studio is intended as a local developer tool. By default it binds to `127.0.0.1`.

Do not expose it directly to the public internet without adding authentication, request limits, and deployment hardening.

### Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before opening larger changes.

### License

This project is open source under the [MIT License](LICENSE).

---

## 日本語

Audio Pipeline Studio は、FFmpeg を使って音声ファイルを確認、承認、プレビュー、バッチ処理するためのローカル Web UI です。

ゲームオーディオや制作ワークフロー向けに設計されています。波形を確認し、元音声と処理済みプレビューを比較し、フェードやトリムを調整して、承認済みファイルを正規化された出力フォルダへ書き出せます。

### ドキュメント言語

このリポジトリのルート `README.md` では、英語と日本語のドキュメントを同じ GitHub ページ上で表示します。

- 英語: [README.md#english](#english)
- 日本語: [README.md#日本語](#日本語)
- 日本語のみ: [README.ja.md](README.ja.md)

ドキュメントの言語を変更しても、音声処理設定や FFmpeg の動作は変わりません。

### 主な機能

- 入力フォルダから `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`, `.aac` ファイルをスキャンします。
- 波形表示つきで音声を確認できます。
- バッチ処理前にファイルを承認または承認解除できます。
- バッチ処理前に処理済みプレビューをレンダリングできます。
- 承認済みファイル、またはスキャン済みの全ファイルを処理できます。
- 入力フォルダの階層構造を出力フォルダ側にも保持します。
- Flask ベースのローカル UI から FFmpeg 処理を実行します。
- ブラウザから単一の音声ファイルをアップロードして処理できます。
- アプリケーション UI を英語と日本語で切り替えられます。

### 必要環境

- Python 3.10 以上
- FFmpeg と FFprobe

FFmpeg / FFprobe は次のいずれかの方法で利用できます。

- `FFMPEG_PATH` / `FFPROBE_PATH` 環境変数
- システムの `PATH`
- FFmpeg については `imageio-ffmpeg` のフォールバック

### クイックスタート

```powershell
git clone https://github.com/yusufkanbur/audio-pipeline-studio.git
cd audio-pipeline-studio
.\run.ps1
```

起動後、ブラウザで次を開きます。

```text
http://127.0.0.1:5177
```

### 設定

アプリケーションのローカル実行状態は `data/state.json` に保存されます。このファイルは Git の管理対象外です。

任意の環境変数:

```powershell
$env:APS_INPUT_DIR = "C:\path\to\audio\input"
$env:APS_OUTPUT_DIR = "C:\path\to\audio\output"
$env:APS_HOST = "127.0.0.1"
$env:APS_PORT = "5177"
$env:FFMPEG_PATH = "C:\tools\ffmpeg\bin\ffmpeg.exe"
$env:FFPROBE_PATH = "C:\tools\ffmpeg\bin\ffprobe.exe"
```

`APS_INPUT_DIR` と `APS_OUTPUT_DIR` を指定しない場合、アプリケーションはプロジェクト内の `input` と `output` フォルダを既定値として使用します。

### 処理プリセット

- `Music / Ambience`: ハイパス、ラウドネス正規化、フェード、リミッター。
- `SFX / One-shot`: 任意のトリム、ラウドネス正規化、フェード、リミッター。

### セキュリティモデル

Audio Pipeline Studio はローカル開発ツールとして想定されています。既定では `127.0.0.1` にバインドします。

認証、アップロード制限、リクエスト制限、本番環境向けの堅牢化を追加せずに、公開インターネットへ直接公開しないでください。

### コントリビューション

コントリビューションは歓迎します。大きな変更を行う前に [CONTRIBUTING.md](CONTRIBUTING.md) と [SECURITY.md](SECURITY.md) を確認してください。

### ライセンス

このプロジェクトは [MIT License](LICENSE) のもとで公開されています。
