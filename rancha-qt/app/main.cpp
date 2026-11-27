#include <QFont>
#include <QFontDatabase>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickStyle>

int main(int argc, char* argv[]) {
  QGuiApplication app(argc, argv);
  QGuiApplication::setApplicationName(QStringLiteral("Rancha"));
  QGuiApplication::setOrganizationName(QStringLiteral("Rancha"));
  // The desktop entry / Wayland app id, the same as the Electron app's (APP_ID "rancha").
  // The data folder is NOT taken from Qt (see rancha/data_paths.h).
  QGuiApplication::setDesktopFileName(QStringLiteral("rancha"));
  // Poppins (bundled, like the Electron app). Medium registers as its own family "Poppins Medium"; it is the normal text.
  // If a font cannot be loaded the system font is used instead.
  for (const char* file : {"poppins-400.woff", "poppins-500.woff", "poppins-700.woff"}) {
    if (QFontDatabase::addApplicationFont(QStringLiteral(":/qt/qml/Rancha/assets/fonts/") + QLatin1String(file)) < 0)
      qWarning("Could not load font %s", file);
  }
  if (QFontDatabase::families().contains(QStringLiteral("Poppins Medium"))) {
    QFont font(QStringLiteral("Poppins Medium"));
    font.setPixelSize(15);
    QGuiApplication::setFont(font);
  }
  QQuickStyle::setStyle(QStringLiteral("Basic"));  // a plain, fully themeable style (our own look comes later)

  QQmlApplicationEngine engine;
  QObject::connect(
      &engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
  engine.loadFromModule("Rancha", "Main");
  return app.exec();
}
