#include "CoreInfo.h"

#include <algorithm>
#include <string>
#include <vector>

#include "rancha/natural_compare.h"
#include "rancha/version.h"

CoreInfo::CoreInfo(QObject* parent) : QObject(parent) {}

QString CoreInfo::version() const { return QString::fromLatin1(rancha::kVersion); }

QString CoreInfo::sortDemo() const {
  std::vector<std::string> names = {"Episode 10", "Episode 2", "Episode 1", "Episode 11"};
  std::sort(names.begin(), names.end(), [](const std::string& a, const std::string& b) { return rancha::naturalCompare(a, b) < 0; });
  QStringList parts;
  for (const auto& name : names) parts << QString::fromStdString(name);
  return parts.join(QStringLiteral(" · "));
}
