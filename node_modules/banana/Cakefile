#### Module Dependencies ####
fs = require 'fs'
{exec, spawn} = require 'child_process'
baker = require 'baker'

#### Baker ####

# open all files in src/ with gedit
baker.open 'gedit', ['src', 'frontend/index.html']

baker.watch '.sass', [''], (source) -> "compass compile"

baker.watch '.coffee', ['src/frontend'], (source) -> "coffee -o frontend/scripts #{ source }"
baker.watch '.coffee', ['src/backend'], (source) -> "coffee -o backend #{ source }"

option '-l', '--list', 'list all target liles'

#### Tasks ####
        
task 'open', 'open files', (options) ->
    if options.list
        baker.listOpen()
    else
        baker.execOpen()
        
task 'build', 'build everything', (options) ->
    if options.list
        baker.listBuild()
    else
        baker.execBuild()
        
task 'watch', 'watch and build everything', (options) ->
    if options.list
        baker.listWatch()
    else
        baker.execWatch()
