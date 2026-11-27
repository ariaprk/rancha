#pragma once
#include <QObject>
#include <QString>
#include <QtQml/qqmlregistration.h>

// The small bridge that lets the window ask the core things. Here: its version and a demonstration of natural sorting.
class CoreInfo : public QObject {
  Q_OBJECT
  QML_ELEMENT
  QML_SINGLETON
  Q_PROPERTY(QString version READ version CONSTANT)
  Q_PROPERTY(QString sortDemo READ sortDemo CONSTANT)

 public:
  explicit CoreInfo(QObject* parent = nullptr);
  QString version() const;
  QString sortDemo() const;
};
