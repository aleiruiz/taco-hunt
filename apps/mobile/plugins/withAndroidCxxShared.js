const { withAppBuildGradle, withProjectBuildGradle } = require("expo/config-plugins");

const MARKER = "// Taco Hunt: use the shared C++ runtime for every native module";
const APP_MARKER = "// Taco Hunt: pass the shared C++ runtime to the app CMake graph";

const CMAKE_ARGUMENTS = [
  '"-DANDROID_STL=c++_shared"',
  '"-DCMAKE_SHARED_LINKER_FLAGS=-lc++_shared"',
  '"-DCMAKE_MODULE_LINKER_FLAGS=-lc++_shared"',
].join(", ");

const GLOBAL_CXX_RUNTIME = `${MARKER}
subprojects { subproject ->
  def configureSharedCxxRuntime = {
    def androidExtension = subproject.extensions.findByName("android")
    if (androidExtension != null) {
      def cmake = androidExtension.defaultConfig.externalNativeBuild.cmake
      def sharedStlFlag = "-DANDROID_STL=c++_shared"
      def sharedRuntimeFlag = "-DCMAKE_SHARED_LINKER_FLAGS=-lc++_shared"
      def moduleRuntimeFlag = "-DCMAKE_MODULE_LINKER_FLAGS=-lc++_shared"
      if (!cmake.arguments.contains(sharedStlFlag)) {
        cmake.arguments.add(sharedStlFlag)
      }
      if (!cmake.arguments.contains(sharedRuntimeFlag)) {
        cmake.arguments.add(sharedRuntimeFlag)
      }
      if (!cmake.arguments.contains(moduleRuntimeFlag)) {
        cmake.arguments.add(moduleRuntimeFlag)
      }
    }
  }
  subproject.plugins.withId("com.android.library") { configureSharedCxxRuntime() }
  subproject.plugins.withId("com.android.application") { configureSharedCxxRuntime() }
}
`;

module.exports = function withAndroidCxxShared(config) {
  config = withProjectBuildGradle(config, (projectConfig) => {
    if (projectConfig.modResults.language !== "groovy") {
      return projectConfig;
    }

    const contents = projectConfig.modResults.contents;
    if (!contents.includes(MARKER)) {
      projectConfig.modResults.contents = `${contents.trimEnd()}\n\n${GLOBAL_CXX_RUNTIME}`;
    }

    return projectConfig;
  });

  return withAppBuildGradle(config, (appConfig) => {
    if (appConfig.modResults.language !== "groovy") {
      return appConfig;
    }

    const contents = appConfig.modResults.contents;
    if (!contents.includes(APP_MARKER)) {
      const appCmakeConfig = `${APP_MARKER}
        externalNativeBuild {
            cmake {
                arguments.addAll([${CMAKE_ARGUMENTS}])
            }
        }
`;
      appConfig.modResults.contents = contents.replace(
        /(defaultConfig\s*\{\s*)/,
        `$1${appCmakeConfig}`,
      );
    }

    return appConfig;
  });
};
