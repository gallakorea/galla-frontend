
  cordova.define('cordova/plugin_list', function(require, exports, module) {
    module.exports = [
      {
          "id": "cordova-plugin-iosrtc.Plugin",
          "file": "plugins/cordova-plugin-iosrtc/www/cordova-plugin-iosrtc.js",
          "pluginId": "cordova-plugin-iosrtc",
        "clobbers": [
          "cordova.plugins.iosrtc"
        ]
        }
    ];
    module.exports.metadata =
    // TOP OF METADATA
    {
      "cordova-plugin-iosrtc": "8.0.4"
    };
    // BOTTOM OF METADATA
    });
    