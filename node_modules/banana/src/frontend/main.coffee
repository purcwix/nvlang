require.config
    paths:
        jquery: 'lib/jquery-1.7.1.min'
        io: 'lib/socket.io-client-amd'
        raphael: 'lib/raphael-min'
        underscore: 'lib/underscore-min'
        backbone: 'lib/backbone-amd-min'
        hogan: 'lib/hogan'
        
require ['jquery','io', 'raphael', 'underscore', 'backbone', 'hogan'], ($, io, Raphael, _, Backbone, hogan) ->

    Mediator = {}
    
    _.extend Mediator, Backbone.Events
    



    Chart = {}

    class Chart.Model extends Backbone.Model
            
        maxAge: 4000
        
        data: []
        
        add: (data) ->        
            data.age = (new Date).getTime()        
            @data.push data
        
        update: ->            
            now = (new Date).getTime()  
            @data = _.filter @data, (elem) =>
                now - elem.age < @maxAge
                

        toPath: (chart) ->
            
            
            if @data.length is 0 then return
            
            now = (new Date).getTime()  
            
            toCoord = (data) ->
                x: chart.width + 50 - (now - data.age)/4
                y: chart.height - (data.value - data.lowerBound) * chart.height / (data.upperBound - data.lowerBound)
            
            
            coord = toCoord @data[0]
            
            path = "M#{coord.x} #{coord.y} R"
            
            for dot in @data
                coord = toCoord dot
                path += " #{coord.x} #{coord.y}"
                
                
            return path
         
         
         
         
               
        
    class Chart.Collection extends Backbone.Collection
    
    
        model: Chart.Collection
        
        parse: (data) =>
            raw = data
            # try to parse the raw data and dump it if error
            try 
                data = JSON.parse data
            catch error
                console.log error
                console.log raw
                return
                
            chart = @get data.name                    
                    
            if not chart                         
            
                newChart = new Chart.Model
                newChart.add data
                newChart.id = data.name
                newChart.waveform = data.waveform
                
                @add newChart
                
                Mediator.trigger 'chart:new', data.name
                
            else
                chart.add data
                
                
        update: =>
            for model in @models
                model.update()
        
        
        render: =>
            for model in @models
                model.view.render()
        
        
        
        
        
        
    
    #
    #   Oscilloscope
    #
        
        
    class Oscilloscope extends Backbone.View
    
        el: $('#oscilloscope-container')
                
        width: 800
        height: 150
        
        render: =>
            
            path = @model.toPath @
            
            @path.attr
                path: path
                    
                    
        initialize: (@id, @model) ->
        
            # fetch and compile the template
            template = hogan.compile $('#oscilloscope').text()
            
            # render and attach it            
            $('#container').append template.render 
                name: @id
            
            @paper = Raphael @id, @width, @height
            @path = @paper.path 'M 0 0'
            @path.attr
                stroke: 'rgb(200, 200, 2005)'
                'stroke-width': 5
                
              
    
    #
    #   Meter
    #  
                
    class Meter extends Backbone.View
    
        el: $('#meter-container')
                
        width: 800
        height: 150
        
        initialize: ->
            console.log "meter #{@attributes.id} initialized"
        # render all charts
        render: ->
            
            
        
            
        
        
    # the charts    
    
    chart = new Chart.Collection  
    
    
    
    #
    #   Socket.io
    #
    
    socket = io.connect()    
    socket.on 'data', (data) ->   
        Mediator.trigger 'chart:data', data
        
        
        
    #
    #   Clock
    #        
        
    setInterval -> 
        Mediator.trigger 'chart:update'
    , 40
    
    
    
    
    
      
        
    #
    #   Event Binding
    #   
    
    
    Mediator.bind 'chart:data', (data) ->
        chart.parse data
        
    
    Mediator.bind 'chart:new', (id) ->
    
        console.log 'new chart!!'
        
        model = chart.get id
        
        
        if model.waveform
        
            console.log 'Oscilloscope'
            
            model.view = new Oscilloscope id, model
            
        else
            
            console.log 'Meter'
            
            model.view = new Meter id, model
            
        
        
    
    Mediator.bind 'chart:update', ->
        
        chart.update()        
        chart.render()
        
        
        
        
        
    
