"""Где движок хранит проекты, звуки и модели.

Windows — %LOCALAPPDATA%\\clipzy (путь без кириллицы: OpenCV не открывает такие пути).
Сервер и Vercel Sandbox — папка из переменной CLIPZY_HOME.
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.environ.get("CLIPZY_HOME") or os.path.join(os.environ.get("LOCALAPPDATA", "."), "clipzy")
