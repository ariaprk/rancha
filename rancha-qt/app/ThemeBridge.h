#pragma once
#include <QColor>
#include <QObject>
#include <QString>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>

#include <memory>

#include "rancha/settings.h"
#include "rancha/theme.h"

// Shows the core's theme (colors, radii, animation times) to QML. All numbers come from rancha::makePalette;
// this class only converts them to Qt types and tells QML when they change.
// Q3: the look is read from settings.json (shared with the Electron app) and every change is saved there.
class ThemeBridge : public QObject {
  Q_OBJECT
  QML_ELEMENT
  QML_SINGLETON

  // settings (writable)
  Q_PROPERTY(QString mode READ mode WRITE setMode NOTIFY changed)        // "dark" | "light" | "airy"
  Q_PROPERTY(QString accent READ accent WRITE setAccent NOTIFY changed)  // "#rrggbb"
  Q_PROPERTY(QString corners READ corners WRITE setCorners NOTIFY changed)
  Q_PROPERTY(QString glass READ glass WRITE setGlass NOTIFY changed)
  Q_PROPERTY(QString motion READ motion WRITE setMotion NOTIFY changed)
  Q_PROPERTY(bool ambientGlow READ ambientGlow WRITE setAmbientGlow NOTIFY changed)

  // computed values (read only)
  Q_PROPERTY(bool isDark READ isDark NOTIFY changed)
  Q_PROPERTY(QColor bg READ bg NOTIFY changed)
  Q_PROPERTY(QColor surface READ surface NOTIFY changed)
  Q_PROPERTY(QColor surface2 READ surface2 NOTIFY changed)
  Q_PROPERTY(QColor text READ text NOTIFY changed)
  Q_PROPERTY(QColor textDim READ textDim NOTIFY changed)
  Q_PROPERTY(QColor border READ border NOTIFY changed)
  Q_PROPERTY(QColor glassColor READ glassColor NOTIFY changed)
  Q_PROPERTY(QColor glassBorder READ glassBorder NOTIFY changed)
  Q_PROPERTY(QColor accentColor READ accentColor NOTIFY changed)
  Q_PROPERTY(QColor accentFrom READ accentFrom NOTIFY changed)
  Q_PROPERTY(QColor accentTo READ accentTo NOTIFY changed)
  Q_PROPERTY(QColor lightCenter READ lightCenter NOTIFY changed)
  Q_PROPERTY(QColor shadeBottom READ shadeBottom NOTIFY changed)
  Q_PROPERTY(qreal ambientStrength READ ambientStrength NOTIFY changed)
  Q_PROPERTY(qreal radius READ radius NOTIFY changed)
  Q_PROPERTY(qreal radiusSmall READ radiusSmall NOTIFY changed)
  Q_PROPERTY(int fastMs READ fastMs NOTIFY changed)
  Q_PROPERTY(int medMs READ medMs NOTIFY changed)
  Q_PROPERTY(qreal hoverScale READ hoverScale NOTIFY changed)
  Q_PROPERTY(QString fontBold READ fontBold CONSTANT)  // family for bold text (the normal family is the app font)

 public:
  explicit ThemeBridge(QObject* parent = nullptr);

  QString mode() const;
  QString accent() const;
  QString corners() const;
  QString glass() const;
  QString motion() const;
  bool ambientGlow() const { return settings_.ambientGlow; }
  void setMode(const QString& value);
  void setAccent(const QString& value);
  void setCorners(const QString& value);
  void setGlass(const QString& value);
  void setMotion(const QString& value);
  void setAmbientGlow(bool value);

  bool isDark() const { return palette_.isDark; }
  QColor bg() const { return toQt(palette_.bg); }
  QColor surface() const { return toQt(palette_.surface); }
  QColor surface2() const { return toQt(palette_.surface2); }
  QColor text() const { return toQt(palette_.text); }
  QColor textDim() const { return toQt(palette_.textDim); }
  QColor border() const { return toQt(palette_.border); }
  QColor glassColor() const { return toQt(palette_.glass); }
  QColor glassBorder() const { return toQt(palette_.glassBorder); }
  QColor accentColor() const { return toQt(palette_.accent); }
  QColor accentFrom() const { return toQt(palette_.accentFrom); }
  QColor accentTo() const { return toQt(palette_.accentTo); }
  QColor lightCenter() const { return toQt(palette_.lightCenter); }
  QColor shadeBottom() const { return toQt(palette_.shadeBottom); }
  qreal ambientStrength() const { return palette_.ambientStrength; }
  qreal radius() const { return palette_.radius; }
  qreal radiusSmall() const { return palette_.radiusSmall; }
  int fastMs() const { return palette_.fastMs; }
  int medMs() const { return palette_.medMs; }
  qreal hoverScale() const { return palette_.hoverScale; }

  // The accent presets as a list of { name, main, from, to } for the color buttons.
  QString fontBold() const { return QStringLiteral("Poppins"); }

  Q_INVOKABLE QVariantList accentPresets() const;

  static QColor toQt(const rancha::Rgba& c) { return QColor::fromRgbF(c.r / 255.0, c.g / 255.0, c.b / 255.0, c.a); }

 signals:
  void changed();

 private:
  void recompute();
  void save(const char* key, const std::string& value);
  void save(const char* key, bool value);
  rancha::ThemeSettings settings_;
  std::unique_ptr<rancha::SettingsStore> store_;  // none when the data folder cannot be used
  rancha::Palette palette_;
};
