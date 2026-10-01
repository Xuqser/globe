# 旅行地球仪 v2：手势版说明

这是从 `photo-album-v1` 分出的手势改版。原始地球、城市灯光、航线和照片导入继续使用；全球浏览与城市观察由双手动作切换，照片相册是城市内的独立页面。

| 状态 | 一只手 | 两只手 | 鼠标／键盘 |
| --- | --- | --- | --- |
| 全球 | 单手摆动一次，地球平滑转动一次；回位不倒转 | 两手从靠近到拉开并保持片刻，进入页面提示的旅行城市 | 拖动旋转、滚轮缩放、点击右侧城市 |
| 城市 | 握拳摆动切地点；握拳后停稳张掌打开相册 | 两手从拉开到靠近并保持片刻，返回全球 | 城市按钮、查看照片、返回全球 |
| 照片 | 张掌摆动翻页；握拳保持返回城市 | 不响应 | 上一张／下一张、方向键、Esc |

双手动作按两掌间距的变化方向判断，不再依赖地球倍率或与城市的距离；初次识别双手时取几帧距离作为基准，动作保持片刻才确认。切换后需要先收回一只手，再重新举起双手才接受下一次切换。全球摆手后回到起点并停稳，或手离开画面，才能再次转动。原版的单手五指缩放、双捏合进城市、五指聚拢退出和比耶流星雨手势不参与新版控制。

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
git switch gesture-modes-v2
python3 server.py
```

上一版相册：`git switch photo-album-v1` 后运行 `python3 server.py`。`local_photos/` 被忽略，切换分支不会清除已导入的照片。回退到 `main` 时原版不会显示相册；再次切回当前版即可恢复。
