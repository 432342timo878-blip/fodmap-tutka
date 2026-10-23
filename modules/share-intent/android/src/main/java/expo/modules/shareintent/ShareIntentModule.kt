package expo.modules.shareintent

import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Vastaanottaa Androidin "Jaa"-valikosta jaetun tekstin (esim. verkkosivun osoitteen)
 * tai kuvan (esim. kuvakaappauksen etiketistä).
 */
class ShareIntentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareIntent")
    Events("onShare")

    // Sovellus käynnistettiin jakamalla: palautetaan jako kerran.
    Function("consumeInitialShare") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      val share = extract(intent) ?: return@Function null
      // Ei käsitellä samaa jakoa uudelleen, jos sovellus latautuu uudestaan.
      intent.action = null
      share
    }

    // Sovellus oli jo auki, kun käyttäjä jakoi.
    OnNewIntent { intent ->
      extract(intent)?.let { sendEvent("onShare", it) }
    }
  }

  private fun extract(intent: Intent): Map<String, String>? {
    if (intent.action != Intent.ACTION_SEND) return null
    val type = intent.type ?: return null
    if (type.startsWith("text/")) {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return null
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
      return mapOf("kind" to "text", "text" to text, "subject" to (subject ?: ""))
    }
    if (type.startsWith("image/")) {
      val uri: Uri? = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(Intent.EXTRA_STREAM)
      }
      return uri?.let { mapOf("kind" to "image", "uri" to it.toString()) }
    }
    return null
  }
}
