// basic Karma configuration for standalone requireJS using dummy.test.js
module.exports = function(config) {
    config.set({

        // base path, that will be used to resolve files and exclude
        basePath: '',

        // frameworks to use
        frameworks: [ 'mocha', 'requirejs' , 'sinon-chai', 'chai-backbone'],

        // list of files / patterns to load into require, if not loaded here will not work later
        files: [
            { pattern: 'lib/**/*.js' , included: false },
            { pattern: 'test/**/*.test.js', included: false},
            { pattern: 'backbone.dualstorage.js' , included: false },
            'test/main.js'
        ],

        // list of files to exclude
        exclude: [
            'public/js/main.js',
            'test/report.html'
        ],

        // test results reporter to use
        // possible values: 'dots', 'progress', 'junit', 'growl', 'coverage'
        reporters: ['progress', 'dots' ,'html'], // need to install spec using

        htmlReporter: {
            outputFile: 'test/report.html'
        },

        // web server port
        port: 9876,

        // CLI --runner-port 9100
        runnerPort : 9100,

        // enable / disable colors in the output (reporters and logs)
        colors: true,

        // level of logging
        // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
        logLevel: config.LOG_ERROR,

        // enable / disable watching file and executing tests whenever any file changes
        autoWatch:false,

        // Start these browsers, currently available:
        // - Chrome
        // - ChromeCanary
        // - Firefox
        // - Opera
        // - Safari (only Mac)
        // - PhantomJS
        // - IE (only Windows)
        browsers: ['Chrome'  ],

        // If browser does not capture in given timeout [ms], kill it
        captureTimeout: 60000,

        // Continuous Integration mode
        // if true, it capture browsers, run tests and exit
        singleRun: false,

        preprocessors : {
        //    '**/client/js/*.js': 'coverage'
    },

    plugins: [
        "karma-mocha",
        "karma-requirejs",
        "karma-sinon-chai",
        "karma-chai-backbone",
        'karma-chrome-launcher',
        'karma-firefox-launcher',
        'karma-safari-launcher',
        'karma-ie-launcher',
        'karma-htmlfile-reporter'
    ]
    });
};
