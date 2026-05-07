# Audio Folder

这里预留给本地音乐文件。

第一阶段为了保证项目开箱能跑，后端会动态生成 mock WAV 音频：

- `/api/audio/host-intro`
- `/api/audio/music/:trackId`

第二阶段可以把本地 mp3 放到这个目录，并让后端从 SQLite 节目单里读取真实文件路径。
