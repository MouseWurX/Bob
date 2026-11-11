package ca.mousewurx.bob

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// 🔐 Locked secrets on the phone (on by default, like desktop Bob's src/secret-box.js). Anything secret the app keeps
// (the login cookies for your other Bobs) is scrambled with AES-256-GCM. The key is made inside the Android Keystore
// and never leaves it: not in the app's files, not in Android's backup. A locked value starts with PREFIX; anything
// else is read as it is (an older app's plain value) and locked the next time it is saved.
object SecretBox {
    const val PREFIX = "bobsecret1:"
    private const val ALIAS = "bob-secret-box"
    private const val AAD = "bob secret box"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun isLocked(v: String?) = v != null && v.startsWith(PREFIX)

    /** The value locked. If the Keystore can't be reached, the value comes back as it was (never lost). */
    fun seal(plain: String): String {
        if (plain.isEmpty() || isLocked(plain)) return plain
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.ENCRYPT_MODE, key())
            c.updateAAD(AAD.toByteArray())
            val body = c.doFinal(plain.toByteArray(Charsets.UTF_8))
            PREFIX + Base64.encodeToString(c.iv + body, Base64.NO_WRAP)
        }.getOrDefault(plain)
    }

    /** The plain words; null when a locked value can't be opened (the Keystore key was wiped). */
    fun open(v: String?): String? {
        if (v == null || !isLocked(v)) return v
        return runCatching {
            val all = Base64.decode(v.removePrefix(PREFIX), Base64.NO_WRAP)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, all.copyOfRange(0, 12)))
            c.updateAAD(AAD.toByteArray())
            String(c.doFinal(all.copyOfRange(12, all.size)), Charsets.UTF_8)
        }.getOrNull()
    }
}
