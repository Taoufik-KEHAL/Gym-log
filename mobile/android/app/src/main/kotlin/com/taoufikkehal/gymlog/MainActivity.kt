package com.taoufikkehal.gymlog

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var stepsHandler: StepsMethodCallHandler? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val handler = StepsMethodCallHandler(this)
        stepsHandler = handler
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, STEPS_CHANNEL).setMethodCallHandler(handler)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (stepsHandler?.onRequestPermissionsResult(requestCode, grantResults) == true) return
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    companion object {
        private const val STEPS_CHANNEL = "com.taoufikkehal.gymlog/steps"
    }
}
