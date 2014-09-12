# Copyright 2010-2012 RethinkDB, all rights reserved.
# Namespace view
module 'TableView', ->
    # Hardcoded!
    MAX_SHARD_COUNT = 32

    class @Sharding extends Backbone.View
        className: 'shards_container'
        template:
            main: Handlebars.templates['shards_container-template']
            status: Handlebars.templates['shard_status-template']
            data_repartition: Handlebars.templates['data_repartition-template']

        view_template: Handlebars.templates['view_shards-template']
        edit_template: Handlebars.templates['edit_shards-template']
        feedback_template: Handlebars.templates['edit_shards-feedback-template']
        error_ajax_template: Handlebars.templates['edit_shards-ajax_error-template']
        reasons_cannot_shard_template: Handlebars.templates['shards-reason_cannot_shard-template']


        initialize: (data) =>
            @listenTo @model, 'change:num_available_shards', @render_status
            @listenTo @collection, 'update', @render_data_repartition

            # Bind listener for the key distribution

            @shard_settings = new TableView.ShardSettings
                model: @model
                container: @
            @progress_bar = new UIComponents.OperationProgressBar @template.status

        # Find a better name
        render_data_repartition: =>
            console.log 'update graph'
            if not @collection_length_cached?
                console.log 'override'
                @collection_length_cached = @collection.length

            # If a shard was removed, we reset the graph
            # That's because ChartJS doesn't let you rename labels
            if @collection.length isnt @collection_length_cached
                console.log 'in'
                if @chart?
                    console.log 'destroy'
                    @chart.destroy()
                    @init_chart = false
            else
                console.log @collection.length
                console.log @collection_length_cached

            @collection_length_cached = @collection.length
            @update_graph()


        # Render the status of sharding
        render_status: =>
            # If some shards are not ready, it means some replicas are also not ready
            # In this case the replicas view will call fetch_progress every seconds,
            # so we do need to set an interval to refresh more often
            progress_bar_info =
                got_response: true

            if @model.get('num_available_shards') < @model.get('num_shards')
                if @progress_bar.get_stage() is 'none'
                    @progress_bar.skip_to_processing() # if the stage is 'none', we skipt to processing

            @progress_bar.render(
                @model.get('num_available_shards'),
                @model.get('num_shards'),
                progress_bar_info
            )
            return @

        render: =>
            @$el.html @template.main()
            @$('.edit-shards').html @shard_settings.render().$el

            @$('.shard-status').html @progress_bar.render(
                @model.get('num_available_shards'),
                @model.get('num_shards'),
                {got_response: true}
            ).$el

            @init_chart = false
            setTimeout => # Let the element be inserted in the main DOM tree
                @render_data_repartition()
            , 0

            return @

        update_graph: =>
            if not @collection?
                return 1

            if not @chart? or @init_chart is false
                @init_chart = true

                ctx = @$('#data_repartition_canvas')[0].getContext('2d')
                data =
                    labels: @collection.map((shard, index) -> "Shard #{index+1}")
                    datasets: [{
                        label: "My Second dataset",
                        fillColor: "rgba(154,215,242,1)",
                        strokeColor: "rgba(151,187,205,0.8)",
                        highlightFill: "rgba(150,210,237,1)",
                        highlightStroke: "rgba(151,187,205,1)",
                        data: @collection.map((shard, index) -> shard.get('num_keys'))
                    }]

                compute_space = (collection_length) ->
                    if collection_length < 5
                        return 3
                    else if collection_length < 10
                        return 2
                    else
                        return 1

                
                @chart = new Chart(ctx).Bar data,
                    barShowStroke: false
                    barDatasetSpacing: compute_space(@collection.length)
                    scaleOverride: true
                    scaleSteps: 4
                    scaleStepWidth: Math.floor _.max(@collection.models, ((shard) -> shard.get('num_keys'))).get('num_keys')*1.10/4
                    scaleStartValue: 0,

            else
                @collection.each (shard, index) =>
                    if @chart.datasets[0].bars[index]?
                        @chart.datasets[0].bars[index].value = shard.get('num_keys')
                        @chart.datasets[0].bars[index].label = "Shard #{index+1}"

                @chart.update()

        remove: =>
            @stopListening()

    class @ShardSettings extends Backbone.View
        template:
            main: Handlebars.templates['shard_settings-template']
            alert: Handlebars.templates['alert_shard-template']
        events:
            'click .edit': 'toggle_edit'
            'click .cancel': 'toggle_edit'
            'click .rebalance': 'shard_table'
            'keypress #num_shards': 'handle_keypress'

        render: =>
            @$el.html @template.main
                editable: @editable
                num_shards: @model.get 'num_shards'
                max_shards: MAX_SHARD_COUNT #TODO: Put something else?
            @

        initialize: (data) =>
            @editable = false
            @container = data.container

            @listenTo @model, 'change:num_shards', @render

        toggle_edit: =>
            @editable = not @editable
            @render()

            if @editable is true
                @$('#num_shards').select()

        handle_keypress: (event) =>
            if event.which is 13
                @shard_table()

        render_shards_error: (fn) =>
            if @$('.settings_alert').css('display') is 'block'
                @$('.settings_alert').fadeOut 'fast', =>
                    fn()
                    @$('.settings_alert').fadeIn 'fast'
            else
                fn()
                @$('.settings_alert').slideDown 'fast'

        shard_table: =>
            new_num_shards = parseInt @$('#num_shards').val()
            if Math.round(new_num_shards) isnt new_num_shards
                @render_shards_error () =>
                    @$('.settings_alert').html @template.alert
                        not_int: true
                return 1
            if new_num_shards > MAX_SHARD_COUNT
                @render_shards_error () =>
                    @$('.settings_alert').html @template.alert
                        too_many_shards: true
                        num_shards: new_num_shards
                        max_num_shards: MAX_SHARD_COUNT
                return 1
            if new_num_shards < 1
                @render_shards_error () =>
                    @$('.settings_alert').html @template.alert
                        need_at_least_one_shard: true
                return 1


            ignore = (shard) -> shard('role').ne('nothing')
            query = r.db(@model.get('db')).table(@model.get('name')).reconfigure(
                new_num_shards,
                r.db(system_db).table('table_status').get(@model.get('uuid'))('shards').nth(0).filter(ignore).count()
            )
            driver.run query, (error, result) =>
                if error?
                    @render_shards_error () =>
                        @$('.settings_alert').html @template.alert
                            server_error: true
                            error: error
                else
                    @toggle_edit()

                    # Triggers the start on the progress bar
                    @container.progress_bar.render(
                        0,
                        result.shards[0].directors.length,
                        {new_value: result.shards[0].directors.length}
                    )

                    @model.set
                        num_available_shards: 0
                        num_available_replicas: 0
                        num_replicas_per_shard: result.shards[0].directors.length
                        num_replicas: @model.get("num_replicas_per_shard")*result.shards[0].directors.length
            return 0

