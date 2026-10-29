# Build Android — Mahjong Solitaire

Projeto Capacitor 8 com WebView offline. O conteúdo do jogo fica em `www/` e é
copiado para `android/app/src/main/assets/public` pelo `cap sync`.

## Ferramentas locais (ignoradas pelo Git)

| Ferramenta | Caminho neste workspace |
|---|---|
| JDK 21 (Temurin) | `.jdk/jdk-21.0.13+9` |
| Android SDK | `.android-sdk` |
| Gradle user home | `.gradle-home` |
| Android user home | `.android-user-home` |

`android/local.properties` aponta para o SDK local e também não é versionado.

## Build debug

```bash
cd /home/alunocode/Documents/Mahjong

export JAVA_HOME="$PWD/.jdk/jdk-21.0.13+9"
export ANDROID_HOME="$PWD/.android-sdk"
export ANDROID_USER_HOME="$PWD/.android-user-home"
export GRADLE_USER_HOME="$PWD/.gradle-home"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

npx cap sync android
cd android
./gradlew assembleDebug
```

Saída:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Instalar no celular

1. Ative **Opções do desenvolvedor** e **Depuração USB** no aparelho.
2. Conecte o cabo e autorize o computador.
3. Confira o dispositivo:

```bash
adb devices
```

4. Instale:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Também é possível copiar o APK para o celular e abrir o arquivo, permitindo a
instalação de fontes desconhecidas para o gerenciador de arquivos.

## Ícone e splash

As fontes ficam em `resources/`:

- `icon.png` — 1024×1024 (fonte principal)
- `icon-only.png` — ícone legado
- `icon-foreground.png` / `icon-background.png` — camadas adaptativas
- `splash.png` — 2732×2732

Para regenerar:

```bash
node tools/make_brand_assets.mjs
npx @capacitor/assets generate --android --assetPath resources \
  --iconBackgroundColor '#17110e' --iconBackgroundColorDark '#17110e' \
  --splashBackgroundColor '#17110e' --splashBackgroundColorDark '#17110e' \
  --logoSplashScale 0.3
```

## Configuração do app

- ID: `com.jeffbrasil.mahjong`
- Nome exibido: `Mahjong Solitaire`
- Versão: `1.0.0` (`versionCode` 1)
- Orientação: `fullUser` (paisagem e retrato automáticos)
- minSdk 24 / targetSdk 36
- Tema sem barra de ações e em tela cheia
