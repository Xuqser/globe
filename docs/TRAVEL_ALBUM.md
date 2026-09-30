# 旅行地球仪 v1：版本说明

这是从原版 `main` 分出的独立版本。原始地球、城市灯光和航线继续使用；手势入口改成全球、城市、照片三个状态，避免同一个张合动作同时触发缩放和退出。

| 状态 | 一只手 | 两只手 | 鼠标／键盘 |
| --- | --- | --- | --- |
| 全球 | 移动手掌旋转 | 拉开放大、靠近缩小；有照片的地点超过 1.75× 后进入城市 | 拖动旋转、滚轮缩放、点击右侧城市 |
| 城市 | 握拳摆动切地点；握拳后停稳张掌打开相册 | 靠近缩小，低于 1.30× 后返回全球 | 城市按钮、查看照片、返回全球 |
| 照片 | 张掌摆动翻页；握拳保持返回城市 | 不响应 | 上一张／下一张、方向键、Esc |

进入和退出使用不同倍率阈值；模式切换后暂时忽略后续手势，并要求摆手后停稳才重新待命。原版的单手五指缩放、双捏合进城市、五指聚拢退出和比耶流星雨手势不参与新版控制。

照片通过 `server.py` 接收到 `local_photos/originals/`，预览在 `local_photos/images/`，索引在 `local_photos/photos.json`。这些数据不提交到 Git。导入会用 SHA-256 跳过重复内容。HEIC 的 GPS 由 macOS ImageIO 提取，预览用 libheif 的 `heif-convert` 生成；这一选择是因为某些 iPhone HEIC 用 `sips` 会得到全黑预览。

## 回退

先在终端按 `Control + C` 停止服务器，然后：

```sh
cd /Users/johnsonxu/globe
git switch main
python3 -m http.server 8000 --bind 127.0.0.1
```

恢复新版：

```sh
cd /Users/johnsonxu/globe
git switch photo-album-v1
python3 server.py
```

`local_photos/` 被忽略，切换分支不会清除已导入的照片。回退时原版不会显示相册；再次切回新版即可恢复。
