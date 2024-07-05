const arrowWidth = 13;
const arrowHeight = 5;
const defaultLength = 50;

var allGroups = [];  // This should be your array or object containing all group objects

// Assume we have an initial JSON object with group positions and IDs
var plantData = {  // This will be retrieved by a call to the back-end
    "unit_operations": [
      { 
        "id": "u0001", 
        "name": "Thickener 1", 
        "x": 50, "y": 75, "w": 100, "h": 50,
        "input_stream_ids": [
            {"stream_id": "S0001", "landingSite": "left-0"}],
        "output_streams": [
            {"stream_id": "s0003", "name": "Thickener 1 Underflow", "attachmentSite": "bottom-0"}, 
            {"stream_id": "s0002", "name": "Thickener 1 Overflow", "attachmentSite": "right-0"}]
      },
      { 
        "id": "u0002", 
        "name": "Thickener 2", 
        "x": 350, "y": 75, "w": 100, "h": 50,
        "input_stream_ids": [
            {"stream_id": "S0002", "landingSite": "left-0"}],
        "output_streams": [
            {"stream_id": "s0004", "name": "Thickener 2 Overflow", "attachmentSite": "right-0"},
            {"stream_id": "s0005", "name": "Thickener 2 Underflow", "attachmentSite": "bottom-0" }]
      },
      // ... more unit_operations
    ]
  };

  function findLandingXY(streamId, plantData) {
    for (let unit of plantData.unit_operations) {
        for (let stream of unit.input_stream_ids) {
            if (stream.stream_id.toLowerCase() === streamId.toLowerCase()) {
                let landingSide = stream.landingSite.split("-")[0];
                if (landingSide === "left") {
                    return {x: unit.x, y: unit.y + unit.h/2};
                } else if (landingSide === "right") {
                    return {x: unit.x + unit.w, y: unit.y + unit.h/2};
                } else if (landingSide === "top") {
                    return {x: unit.x + unit.w/2, y: unit.y};
                } else { // if (landingSide === "bottom") {
                    return {x: unit.x + unit.w/2, y: unit.y + unit.h};
                }
            }
        }
    }
    return {x: null, y: null};
}

/*
Calculate start and end of line that connects this stream to the src and dst units.
*/
function calculateLineEndsToDischargeStream(data, idx) {
    let lineStartX;
    let lineStartY;
    let lineEndX;
    let lineEndY;

    let dischargeAttachment = data.output_streams[idx]?.attachmentSite;
    let dischargeAttachSide = dischargeAttachment?.split("-")[0];
    if (dischargeAttachSide === "bottom") {
        lineStartX = data.x + data.w / 2;
        lineStartY = data.y + data.h;  
        // if (originAttachment.split("-")(0) === "1") then add that to x-position
    } else if (dischargeAttachSide === "top") {  // must be originating at top
        lineStartX = data.x + data.w / 2;
        lineStartY = data.y;  
        // if (originAttachment.split("-")(0) === "1") then add that to x-position
    } else if (dischargeAttachSide === "left"){
        lineStartX = data.x;
        lineStartY = data.y + data.h / 2; 
    } else { // DEFAULT to if (originAttachment.split("-")(0) === "right") {
        lineStartX = data.x + data.w;
        lineStartY = data.y + data.h / 2; 
        // if (originAttachment.split("-")(0) === "1") then add that to y-position
    }
    
    // Next: Find the attachment site to receiving unitOp
    let myStreamId = data.output_streams[idx].stream_id;
    let landingSite = findLandingXY(myStreamId, plantData);
    lineEndX = landingSite.x;
    lineEndY = landingSite.y;
    if (lineEndX === null || lineEndY ===null) {  // Go fixed length in direction according to discharge side
        console.log("Dangling Stream");
        if (dischargeAttachSide === "right") {
            lineEndX = lineStartX + defaultLength;
            lineEndY = lineStartY;
        } else if (dischargeAttachSide === "bottom") {
            lineEndX = lineStartX;
            lineEndY = lineStartY + defaultLength;
        } else if (dischargeAttachSide === "top") {
            lineEndX = lineStartX;
            lineEndY = lineStartY - defaultLength;
        } else {  // must be on the left
            lineEndX = lineStartX - defaultLength;
            lineEndY = lineStartY;
        }
    } else {
        console.log("End points already calculated.")
    }

    return { lineStartX, lineStartY, lineEndX, lineEndY };
}

var draw = SVG().addTo('#drawing').size('100%', '100%');
  
/* Function to create a draggable group with a unit op (rectangle) plus one discharge stream (text, 5-node line, and arrow)
   But what is there is more that one output stream?
*/
function createDraggableGroup(data, fillColor) {
    var group = draw.group().attr({ 'data-id': data.id });
    
    // Create rectangle and text for the step
    group.rect = group.rect(data.w, data.h).attr({ fill: 'white', stroke: 'black' }).move(data.x, data.y);
    
    // Create text for the step
    group.text = group.text(data.name).attr({stroke: 'black' }).move(data.x + 25, data.y + 20);
    
    // Centering text within rectangle
    var bbox = group.text.bbox();
    group.text.move(data.x + (data.w - bbox.width) / 2, data.y + (data.h - bbox.height) / 2);

    group.data = data
    group.referencedLines = [];
    group.referencedArrows = [];
    
    data.output_streams.forEach(function(stream, idx) {
        drawLineAndArrow(group, idx);
    });

    // Add event listeners for dragging
    group.on('mousedown', function(event) {
        startDrag(event, group);
    });
   
    return group;
}

function findInputUnits(streamId, plantData) {
    for (let unit of plantData.unit_operations) {
        for (let stream of unit.output_streams) {
            if (stream.stream_id.toLowerCase() === streamId.toLowerCase()) {
                return unit.id;
            }
        }
    }
    return null;
}

// Function to start dragging
function startDrag(event, group) {
    deleteLineAndArrows(group);

    // Get the initial mouse position
    var startX = event.clientX;
    var startY = event.clientY;
    
    // Get the initial position of the group
    var groupX = group.x();
    var groupY = group.y();
    
    // Function to handle dragging (mousemove event)
    function drag(event) {
        // Calculate the new position of the group
        var dx = event.clientX - startX;
        var dy = event.clientY - startY;
        group.data.x = groupX + dx;
        group.data.y = groupY + dy;
        group.move(groupX + dx, groupY + dy);
    }

    // Function to end dragging (mouseup event)
    function endDrag() {
        // Remove the event listeners
        window.removeEventListener('mousemove', drag);
        window.removeEventListener('mouseup', endDrag);
        console.log("Commencing dragging.");
        
        // Reconnect to downstream units
        group.data.output_streams.forEach(function(stream, idx) {
            drawLineAndArrow(group, idx);
        });
        
        // Reconnect to upstream units
        group.data.input_stream_ids.forEach(function(stream, idx) {
            var stream_id = stream.stream_id;
            console.log("Searching for unit assoc with stream ID: " + stream_id);
            var unitId = findInputUnits(stream.stream_id, plantData);
            if (unitId) { 
                console.log("Found unit = " + unitId);
                var groupElement = allGroups.find(group => group.attr('data-id') === unitId);
                deleteLineAndArrows(groupElement);
                groupElement.data.output_streams.forEach(function(stream, idx) {
                    console.log(groupElement);
                    console.log("idx " + idx + ": attempting to redraw stream_id " + stream.stream_id);
                    drawLineAndArrow(groupElement, idx);
                });
            } else { 
                console.log("Unit id was null");
            }
        });
        
        // Update the JSON object with the new position
        var id = group.attr('data-id');
        var groupData = plantData.unit_operations.find(g => g.id === id);
        if (groupData) {
            groupData.x = group.x();
            groupData.y = group.y();
            // Persist the new position to the JSON file
            savePositionsToFile(plantData);
        }
    }
    
    // Add the event listeners
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);
}

function deleteLineAndArrows(group) {
    console.log("Deleting lines and arrow for unit " + group.data.id);
    group.referencedLines.forEach(line => line.remove());
    group.referencedArrows.forEach(arrow => arrow.remove());
    group.referencedLines = [];
    group.referencedArrows = [];
}

function drawLineAndArrow(group, idx) {
    // Calculate start positions for line inside this function
    const { lineStartX, lineStartY, lineEndX, lineEndY } = calculateLineEndsToDischargeStream(group.data, idx);

    // Calculate midpoint for orthogonal arrangement
    const midPointX = (lineStartX + lineEndX) / 2; // or some other logic to determine the bend point
    const midPointY = (lineStartY + lineEndY) / 2; // or some other logic to determine the bend point

    // Create a new polyline with two segments using the SVG.js methods
    var newLine = group.polyline([[lineStartX, lineStartY], [midPointX, lineStartY], [midPointX, midPointY], [midPointX, lineEndY], [lineEndX, lineEndY]])
        .fill('none')
        .stroke({ color: '#000', width: 2 });

    var newArrow = group.polygon(`0,0 0,${arrowHeight} ${arrowWidth},0 0,-${arrowHeight}`)
        .move(lineEndX - arrowWidth, lineEndY - arrowHeight)
        .fill('#000');

    // If you need to reference these later, you can assign them to properties on the group
    group.referencedLines.push(newLine);
    group.referencedArrows.push(newArrow);
}

  // Function to save the updated positions to a file
  function savePositionsToFile(updatedData) {
      // Convert the JSON object to a string
      var jsonString = JSON.stringify(updatedData);
     
      // Code to save jsonString to a file
      // This will depend on your environment, e.g., Node.js, browser, etc.
      // For example, in Node.js, you might use fs.writeFileSync('path/to/file.json', jsonString);
  }
  
  // Create unit_operations from the JSON data
  plantData.unit_operations.forEach(data => {
      var grp = createDraggableGroup(data, '#000');
      allGroups.push(grp);
  });