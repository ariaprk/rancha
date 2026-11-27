#include "ThemeBridge.h"

#include <QVariantMap>

#include "rancha/data_paths.h"

ThemeBridge::ThemeBridge(QObject* parent) : QObject(parent) {
  try {
    store_ = std::make_unique<rancha::SettingsStore>(rancha::dataPaths().settings());
    const auto& saved = store_->get();
    settings_.mode = rancha::themeModeFromString(saved.theme);
    settings_.accent = rancha::sanitizeAccent(saved.accent);
    settings_.corners = rancha::cornerStyleFromString(saved.corners);
    settings_.glass = rancha::glassLevelFromString(saved.glass);
    settings_.motion = rancha::motionLevelFromString(saved.motion);
    settings_.ambientGlow = saved.ambientGlow;
  } catch (const std::exception& error) {
    store_.reset();
    qWarning("Could not read the settings, using the defaults: %s", error.what());
  }
  palette_ = rancha::makePalette(settings_);
}

void ThemeBridge::save(const char* key, const std::string& value) {
  if (!store_) return;
  try {
    store_->update(nlohmann::json{{key, value}});
  } catch (const std::exception& error) {
    qWarning("Could not save the settings: %s", error.what());
  }
}

void ThemeBridge::save(const char* key, bool value) {
  if (!store_) return;
  try {
    store_->update(nlohmann::json{{key, value}});
  } catch (const std::exception& error) {
    qWarning("Could not save the settings: %s", error.what());
  }
}

QString ThemeBridge::mode() const { return QString::fromLatin1(rancha::toString(settings_.mode)); }
QString ThemeBridge::accent() const { return QString::fromStdString(settings_.accent); }
QString ThemeBridge::corners() const { return QString::fromLatin1(rancha::toString(settings_.corners)); }
QString ThemeBridge::glass() const { return QString::fromLatin1(rancha::toString(settings_.glass)); }
QString ThemeBridge::motion() const { return QString::fromLatin1(rancha::toString(settings_.motion)); }

void ThemeBridge::setMode(const QString& v) {
  settings_.mode = rancha::themeModeFromString(v.toStdString());
  save("theme", std::string(rancha::toString(settings_.mode)));
  recompute();
}
void ThemeBridge::setAccent(const QString& v) {
  settings_.accent = rancha::sanitizeAccent(v.toStdString());
  save("accent", std::string(settings_.accent));
  recompute();
}
void ThemeBridge::setCorners(const QString& v) {
  settings_.corners = rancha::cornerStyleFromString(v.toStdString());
  save("corners", std::string(rancha::toString(settings_.corners)));
  recompute();
}
void ThemeBridge::setGlass(const QString& v) {
  settings_.glass = rancha::glassLevelFromString(v.toStdString());
  save("glass", std::string(rancha::toString(settings_.glass)));
  recompute();
}
void ThemeBridge::setMotion(const QString& v) {
  settings_.motion = rancha::motionLevelFromString(v.toStdString());
  save("motion", std::string(rancha::toString(settings_.motion)));
  recompute();
}
void ThemeBridge::setAmbientGlow(bool v) {
  settings_.ambientGlow = v;
  save("ambientGlow", settings_.ambientGlow);
  recompute();
}

void ThemeBridge::recompute() {
  palette_ = rancha::makePalette(settings_);
  emit changed();
}

QVariantList ThemeBridge::accentPresets() const {
  QVariantList list;
  for (const auto& p : rancha::accentPresets()) {
    QVariantMap m;
    m[QStringLiteral("name")] = QString::fromStdString(p.name);
    m[QStringLiteral("main")] = QString::fromStdString(p.main);
    m[QStringLiteral("from")] = QString::fromStdString(p.from);
    m[QStringLiteral("to")] = QString::fromStdString(p.to);
    list.append(m);
  }
  return list;
}
