# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
asr_dir = os.path.join(project_root, 'asr')

datas = [
    (asr_dir, 'asr'),
]

datas += collect_data_files('onnxruntime', include_py_files=False)
datas += collect_data_files('ctranslate2', include_py_files=False)

hiddenimports = [
    'uvicorn.lifespan',
    'uvicorn.loops.auto',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets.auto',
    'fastapi',
    'fastapi.applications',
    'starlette.websockets',
    'ctranslate2',
    'onnxruntime.capi.onnxruntime_pybind11_state',
] + collect_submodules('onnxruntime.capi') + collect_submodules('funasr')

a = Analysis(
    ['../main.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    name='asr-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='asr-backend',
    distpath=os.path.join(project_root, 'backend', 'dist'),
)

