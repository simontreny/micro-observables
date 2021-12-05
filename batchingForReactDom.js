const ReactDOM = require("react-dom");
require("./dist").batchedUpdateFn = ReactDOM.unstable_batchedUpdates;
