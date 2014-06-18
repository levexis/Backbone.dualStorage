ConnectiD Storage
=================

ConnectiD Backbone dualStorage Adapter forked from Backbone.dualStorage v1.1.0, drop in replacement.

Extends dualStorage to work with mobile apps, support should be added via collection properties. This was designed
for use with a Backbone Phonegap app. The idea is that it always returns local copies of data to keep app snappy and then
does a lazy fetch. You can change this by using returns = local
