package com.example.livegg1

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview as CameraPreview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.example.livegg1.ui.theme.LiveGG1Theme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.vosk.android.StorageService
import java.io.IOException
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.graphics.Shadow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.tooling.preview.Preview
import android.content.res.Configuration
import androidx.compose.foundation.layout.offset

class MainActivity : ComponentActivity() {

    private lateinit var cameraExecutor: ExecutorService
    private var permissionsGranted by mutableStateOf(mapOf<String, Boolean>())

    private val requestMultiplePermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            permissionsGranted = permissions
            permissions.entries.forEach {
                Log.d("MainActivity", "${it.key} = ${it.value}")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 设置全屏沉浸式模式
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            // 隐藏导航栏
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            // 隐藏状态栏
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )

        cameraExecutor = Executors.newSingleThreadExecutor()

        val permissionsToRequest = arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )

        val notGrantedPermissions = permissionsToRequest.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (notGrantedPermissions.isNotEmpty()) {
            requestMultiplePermissionsLauncher.launch(notGrantedPermissions.toTypedArray())
        } else {
            permissionsGranted = permissionsToRequest.associateWith { true }
        }

        setContent {
            LiveGG1Theme {
                val allPermissionsGranted = permissionsGranted.all { it.value }
                if (allPermissionsGranted) {
                    CameraScreen(cameraExecutor)
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Camera and/or Audio permission denied. Please grant permissions to use the app.")
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }
}

@Composable
fun CameraScreen(cameraExecutor: ExecutorService) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val configuration = LocalConfiguration.current
    val screenAspectRatio = configuration.screenWidthDp.toFloat() / configuration.screenHeightDp.toFloat()
    val scope = rememberCoroutineScope()

    // --- 状态管理 ---
    var imageToShow by remember { mutableStateOf<Bitmap?>(null) }
    var captionToShow by remember { mutableStateOf("") }
    var model by remember { mutableStateOf<Model?>(null) }
    var speechService by remember { mutableStateOf<SpeechService?>(null) }
    var finalRecognizedText by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(true) }

    // --- 相机设置 ---
    val imageCapture = remember { ImageCapture.Builder().build() }
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }

    // --- Vosk 监听器 ---
    val listener = object : RecognitionListener {
        override fun onResult(hypothesis: String?) {
            hypothesis?.let {
                try {
                    val json = JSONObject(it)
                    val text = json.getString("text")
                    if (text.isNotBlank()) {
                        finalRecognizedText = text
                        Log.d("Vosk", "onResult: $text")
                    }
                } catch (e: Exception) {
                    Log.e("Vosk", "Error parsing result: $it", e)
                }
            }
        }
        override fun onFinalResult(hypothesis: String?) {
             hypothesis?.let {
                try {
                    val json = JSONObject(it)
                    val text = json.getString("text")
                     if (text.isNotBlank()) {
                        finalRecognizedText = text
                        Log.d("Vosk", "onFinalResult: $text")
                    }
                } catch (e: Exception) {
                    Log.e("Vosk", "Error parsing final result: $it", e)
                }
            }
        }
        override fun onError(e: Exception?) {
            Log.e("Vosk", "Recognition error", e)
            finalRecognizedText = "错误: ${e?.message}"
        }
        override fun onTimeout() {
            Log.d("Vosk", "Timeout")
        }
        override fun onPartialResult(hypothesis: String?) {}
    }

    // --- 核心逻辑：初始化和生命周期管理 ---
    LaunchedEffect(Unit) {
        // 1. 初始化 Vosk 模型
        withContext(Dispatchers.IO) {
            var targetPath: String? = null
            try {
                val sourcePath = "model"
                targetPath = StorageService.sync(context, sourcePath, "model")
                Log.d("Vosk", "Model sync completed. Target path: $targetPath")
            } catch (e: IOException) {
                val errorMessage = "错误: 无法同步模型文件。\n原因: ${e.message}"
                Log.e("Vosk", "Failed to sync model from assets.", e)
                captionToShow = errorMessage
                isLoading = false
                return@withContext
            }

            try {
                model = Model(targetPath)
                speechService = SpeechService(Recognizer(model, 16000.0f), 16000.0f)
                Log.d("Vosk", "Model loaded successfully into memory.")
            } catch (e: IOException) {
                Log.e("Vosk", "Failed to load model from path: $targetPath", e)
                captionToShow = "错误: 无法加载模型"
            } finally {
                isLoading = false
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        // 2. 绑定相机
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        val cameraProvider = cameraProviderFuture.get()
        val preview = CameraPreview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
        cameraProvider.unbindAll()
        cameraProvider.bindToLifecycle(lifecycleOwner, cameraSelector, preview, imageCapture)

        // 3. 清理资源
        onDispose {
            cameraProvider.unbindAll()
            speechService?.stop()
            speechService?.shutdown()
            model?.close()
        }
    }

    // --- 核心逻辑：定时拍照和识别的循环 ---
    LaunchedEffect(speechService) {
        speechService?.let { service ->
            // 首次启动时，先拍一张照片作为背景
            takePhoto(imageCapture, cameraExecutor, {
                imageToShow = cropBitmapToAspectRatio(it, screenAspectRatio)
            }, {})
            delay(1000)

            while (true) {
                // 1. 重置状态并开始录音
                finalRecognizedText = ""
                service.startListening(listener)
                Log.d("MainLoop", "Started listening with Vosk...")

                // 2. 等待5秒
                delay(5000L)

                // 3. 停止录音
                service.stop()
                Log.d("MainLoop", "Stopped listening.")

                // 4. 短暂等待，让 onFinalResult 回调有机会执行
                delay(1000L)

                // 5. 拍照并更新UI
                scope.launch {
                    takePhoto(
                        imageCapture = imageCapture,
                        executor = cameraExecutor,
                        onImageCaptured = { newBitmap ->
                            val croppedBitmap = cropBitmapToAspectRatio(newBitmap, screenAspectRatio)
                            imageToShow?.recycle()
                            imageToShow = croppedBitmap
                            captionToShow = finalRecognizedText
                            Log.d("MainLoop", "Photo and caption updated. New caption: '$captionToShow'")
                        },
                        onError = { Log.e("MainLoop", "Photo capture failed", it) }
                    )
                }

                // 6. 在下一次循环前等待
                delay(1000L)
            }
        }
    }

    // --- UI 界面 ---
    CameraScreenContent(
        isLoading = isLoading,
        imageToShow = imageToShow,
        captionToShow = captionToShow,
        previewView = { AndroidView({ previewView }, modifier = Modifier.fillMaxSize()) }
    )
}

@Composable
private fun CameraScreenContent(
    isLoading: Boolean,
    imageToShow: Bitmap?,
    captionToShow: String,
    previewView: @Composable () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        // 1. 摄像头预览或占位图一直在最底层
        previewView()

        // 2. 覆盖层，根据状态显示不同内容
        when {
            isLoading -> {
                // 状态A: 正在加载模型 -> 显示带黑色背景的加载指示器
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = Color.White)
                        Text(
                            "正在加载语音模型...",
                            modifier = Modifier.padding(top = 8.dp),
                            color = Color.White
                        )
                    }
                }
            }
            imageToShow != null -> {
                // 状态B: 模型加载完毕且有图片 -> 显示图片
                Image(
                    bitmap = imageToShow.asImageBitmap(),
                    contentDescription = "Captured Image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }
            else -> {
                // 状态C: 模型加载完毕但暂无图片（如首次拍照前） -> 显示纯黑占位符
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black)
                )
            }
        }

        // 3. 字幕层，始终在最顶层
        if (captionToShow.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart) // 将整个 Column 对齐到左下角
                    .padding(start = 100.dp, bottom = 70.dp, end = 24.dp) // 使用 padding 控制精确边距
            ) {
                val shadow = Shadow(color = Color.Black, offset = Offset(4f, 4f), blurRadius = 8f)
                Text(
                    text = captionToShow,
                    color = Color.White,
                    fontSize = 20.sp,
                    textAlign = TextAlign.Start,
                    style = TextStyle(shadow = shadow)
                )
            }
        }
    }
}

@Preview(
    showBackground = true,
    widthDp = 853, // 模拟横屏宽度
    heightDp = 480, // 模拟横屏高度
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    device = "spec:parent=pixel_5,orientation=landscape"
)
@Composable
fun CameraScreenPreview() {
    LiveGG1Theme {
        // 创建一个占位的黑色 Bitmap 用于预览
        val placeholderBitmap = Bitmap.createBitmap(853, 480, Bitmap.Config.ARGB_8888).apply {
            eraseColor(android.graphics.Color.BLACK)
        }

        CameraScreenContent(
            isLoading = false,
            imageToShow = placeholderBitmap,
            captionToShow = "这是预览字幕。",
            previewView = {
                // 在预览中，我们不需要真实的相机预览，所以这里可以为空或者放一个占位符
                Box(modifier = Modifier
                    .fillMaxSize()
                    .background(Color.DarkGray))
            }
        )
    }
}

fun takePhoto(
    imageCapture: ImageCapture,
    executor: ExecutorService,
    onImageCaptured: (Bitmap) -> Unit,
    onError: (ImageCaptureException) -> Unit
) {
    imageCapture.takePicture(
        executor,
        object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(imageProxy: ImageProxy) {
                val rotationDegrees = imageProxy.imageInfo.rotationDegrees
                val buffer: ByteBuffer = imageProxy.planes[0].buffer
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                imageProxy.close()

                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bitmap != null) {
                    val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                    val rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                    onImageCaptured(rotatedBitmap)
                } else {
                    onError(ImageCaptureException(ImageCapture.ERROR_UNKNOWN, "Failed to decode bitmap", null))
                }
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e("takePhoto", "Photo capture error: ${exception.message}", exception)
                onError(exception)
            }
        }
    )
}
