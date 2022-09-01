require 'faye/websocket'
require 'set'
require './lib/document.rb'
require 'json'
$connections = Set.new
$document = Document.new
def broadcast (msg)
  $connections.each do |ws|
    ws.send(msg.to_s)
  end
end
App = lambda do |env|
  if Faye::WebSocket.websocket?(env)
    ws = Faye::WebSocket.new(env)
    $connections.add(ws)
    ws.on :message do |event|
      data = JSON.parse(event.data)
      if data["type"] == "update"
        operations = data["value"]
        for i in (0).upto((operations.length) - 1) do
          puts operations[i]
          $document.merge(operations[i])
        end
        broadcast(event.data)
        puts "update: #{operations.to_s} #{$document.text}"
      end
    end

    ws.on :close do |event|
      p [:close, event.code, event.reason]
      $connections.delete(ws)
      ws = nil
    end
    # Return async Rack response
    ws.rack_response
  else
    req = Rack::Request.new(env)
    case req.path_info
    when /main.js/
      [200, { 'Content-Type' => 'text/html' }, File.open('dist/main.js', File::RDONLY)]
    else
      [200, { 'Content-Type' => 'text/html' }, File.open('dist/index.html', File::RDONLY)]
    end
  end
end

run App