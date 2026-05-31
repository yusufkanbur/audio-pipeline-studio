# Audio Pipeline Studio

[English](README.md) | [日本語](README.ja.md)

Audio Pipeline Studio は、FFmpeg を使って音声ファイルを確認、承認、プレビュー、バッチ処理するためのローカル Web UI です。

ゲームオーディオや制作ワークフロー向けに設計されています。波形を確認し、元音声と処理済みプレビューを比較し、フェードやトリムを調整して、承認済みファイルを正規化された出力フォルダへ書き出せます。

## ドキュメント言語

この README は次の言語で読むことができます。

- 英語: [README.md](README.md)
- 日本語: [README.ja.md](README.ja.md)

このアプリケーションはローカル実行を前提としたツールです。ドキュメントの言語を変更しても、音声処理設定や FFmpeg の動作は変わりません。

## 主な機能

- 入力フォルダから `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`, `.aac` ファイルをスキャンします。
- 波形表示つきで音声を確認できます。
- バッチ処理前にファイルを承認または承認解除できます。
- バッチ処理前に処理済みプレビューをレンダリングできます。
- 承認済みファイル、またはスキャン済みの全ファイルを処理できます。
- 入力フォルダの階層構造を出力フォルダ側にも保持します。
- Flask ベースのローカル UI から FFmpeg 処理を実行します。
- ブラウザから単一の音声ファイルをアップロードして処理できます。

## 必要環境

- Python 3.10 以上
- FFmpeg と FFprobe

FFmpeg / FFprobe は次のいずれかの方法で利用できます。

- `FFMPEG_PATH` / `FFPROBE_PATH` 環境変数
- システムの `PATH`
- FFmpeg については `imageio-ffmpeg` のフォールバック

## クイックスタート

```powershell
git clone https://github.com/yusufkanbur/audio-pipeline-studio.git
cd audio-pipeline-studio
.\run.ps1
```

起動後、ブラウザで次を開きます。

```text
http://127.0.0.1:5177
```

## 設定

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

## 処理プリセット

- `Music / Ambience`: ハイパス、ラウドネス正規化、フェード、リミッター。
- `SFX / One-shot`: 任意のトリム、ラウドネス正規化、フェード、リミッター。

## セキュリティモデル

Audio Pipeline Studio はローカル開発ツールとして想定されています。既定では `127.0.0.1` にバインドします。

認証、アップロード制限、リクエスト制限、本番環境向けの堅牢化を追加せずに、公開インターネットへ直接公開しないでください。

## コントリビューション

コントリビューションは歓迎します。大きな変更を行う前に [CONTRIBUTING.md](CONTRIBUTING.md) と [SECURITY.md](SECURITY.md) を確認してください。

## ライセンス

このプロジェクトは [MIT License](LICENSE) のもとで公開されています。
