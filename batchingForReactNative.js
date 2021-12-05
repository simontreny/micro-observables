const ReactNative = require("react-native");
require("./dist").batchedUpdateFn = ReactNative.unstable_batchedUpdates;
