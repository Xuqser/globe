# 旅行地球仪 v5：单手连捏两次切换

这是从 `glass-inertia-v4` 分出的手势改版。照片界面沿用半透明玻璃效果；全球模式的单手摆动转动力度加倍，仍逐帧减速且回手不反转。全球浏览与城市观察改为单手食指、拇指连续捏合两次切换。

| 状态 | 一只手 | 模式切换 | 鼠标／键盘 |
| --- | --- | --- | --- |
| 全球 | 单手摆动一次，地球惯性旋转；回位不倒转 | 食指和拇指捏合、松开、再捏合，进入提示的旅行城市 | 拖动旋转、滚轮缩放、点击右侧城市 |
| 城市 | 握拳摆动切地点；握拳后停稳张掌打开相册 | 同样捏合两次返回全球 | 城市按钮、查看照片、返回全球 |
| 照片 | 张掌摆动翻页；握拳保持返回城市 | 不响应 | 上一张／下一张、方向键、Esc |

第一次捏合会停止地球惯性、锁定当时提示的城市并显示「再捏一次」；松开后需在 1.2 秒内完成第二次。切换后有短暂保护时间，避免手仍捏住时立刻切回。两只手同时入镜不会切换模式。全球摆手后回到起点并停稳，或手离开画面，才能再次转动。原版的单手五指缩放、五指聚拢退出和比耶流星雨手势不参与新版控制。

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
git switch pinch-toggle-v5
python3 server.py
```

上一版双手切换手势：`git switch glass-inertia-v4` 后运行 `python3 server.py`。更早的版本在 `photo-glass-v3`、`gesture-modes-v2` 和 `photo-album-v1`。`local_photos/` 被忽略，切换分支不会清除已导入的照片。回退到 `main` 时原版不会显示相册；再次切回当前版即可恢复。
