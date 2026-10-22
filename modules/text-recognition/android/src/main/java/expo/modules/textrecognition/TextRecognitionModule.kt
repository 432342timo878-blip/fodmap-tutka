package expo.modules.textrecognition

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Tunnistaa tekstin kuvasta laitteella (ML Kit). Palauttaa tekstirivit lukujärjestyksessä. */
class TextRecognitionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextRecognition")

    AsyncFunction("recognizeAsync") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("NO_CONTEXT", "React context unavailable", null))
        return@AsyncFunction
      }
      try {
        val image = InputImage.fromFilePath(context, Uri.parse(uri))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(image)
          .addOnSuccessListener { result ->
            promise.resolve(result.textBlocks.flatMap { block -> block.lines.map { it.text } })
            recognizer.close()
          }
          .addOnFailureListener { error ->
            promise.reject(CodedException("RECOGNITION_FAILED", error.message ?: "Text recognition failed", error))
            recognizer.close()
          }
      } catch (error: Exception) {
        promise.reject(CodedException("IMAGE_FAILED", error.message ?: "Could not read image", error))
      }
    }
  }
}
