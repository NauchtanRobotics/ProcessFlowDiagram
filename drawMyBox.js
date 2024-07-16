const arrowWidth = 13;
const arrowHeight = 5;
const defaultLength = 25;

var allGroups = [];  // This should be your array or object containing all group objects

// Assume we have an initial JSON object with group positions and IDs
var plantData = {  // This will be retrieved by a call to the back-end
    "unit_operations": [
      { 
        "id": "u0001", 
        "name": "Thickener 1", 
        "x": 50, "y": 75, "w": 100, "h": 50,
        "input_stream_ids": [
            {"stream_id": "S0001", "landingSite": "left-0.2"},
            {"stream_id": "S0005", "landingSite": "top"}
        ],
        "output_streams": [
            {"stream_id": "s0003", "name": "Thickener 1 Underflow", "attachmentSite": "bottom-0.7"}, 
            {"stream_id": "s0002", "name": "Thickener 1 Overflow", "attachmentSite": "right"}]
      },
      { 
        "id": "u0002", 
        "name": "Thickener 2", 
        "x": 350, "y": 75, "w": 100, "h": 50,
        "input_stream_ids": [
            {"stream_id": "S0002", "landingSite": "left-0"}],
        "output_streams": [
            {"stream_id": "s0004", "name": "Thickener 2 Overflow", "attachmentSite": "right"},
            {"stream_id": "s0005", "name": "Thickener 2 Underflow", "attachmentSite": "bottom" }]
      },
      // ... more unit_operations
    ]
  };

var draw = SVG().addTo('#drawing').size('100%', '100%');

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
    
        // Write updated plantData back to DB/JSON object including latest positions for the dragged group
        if (plantData) {
            savePositionsToFile(plantData);
        }
    }
    
    // Add the event listeners
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);
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

  function findLandingXY(streamId, plantData) {
    for (let unit of plantData.unit_operations) {  // But plantData may not have been updated!!
        for (let stream of unit.input_stream_ids) {
            if (stream.stream_id.toLowerCase() === streamId.toLowerCase()) {
                let landingSide = stream.landingSite.split("-")[0];
                if (landingSide === "left") {
                    return {x: unit.x, y: unit.y + unit.h/2, landingSide: landingSide};
                } else if (landingSide === "right") {
                    return {x: unit.x + unit.w, y: unit.y + unit.h/2, landingSide: landingSide};
                } else if (landingSide === "top") {
                    return {x: unit.x + unit.w/2, y: unit.y, landingSide: landingSide};
                } else { 
                    landingSide = "bottom"
                    return {x: unit.x + unit.w/2, y: unit.y + unit.h, landingSide: landingSide};
                }
            }
        }
    }
    return {x: null, y: null, landingSide: null};
}

/*
Calculate start and end of line that connects this stream to the src and dst units.
*/
function calculateLineEndsToDischargeStream(data, idx) {
    let lineStartX, lineStartY, lineEndX, lineEndY, landingSide;
    let dischargeAttachment = data.output_streams[idx]?.attachmentSite;
    let [dischargeAttachSide, sideFraction = 0.5] = dischargeAttachment?.split("-") || [];
    sideFraction = parseFloat(sideFraction);
    // Find the attachment site to receiving unitOp
    let myStreamId = data.output_streams[idx].stream_id;
    let landingSite = findLandingXY(myStreamId, plantData);
    ({ x: lineEndX, y: lineEndY, landingSide } = landingSite);
    // Determine line start coordinates based on the discharge attachment side
    switch (dischargeAttachSide) {
        case "bottom":
            lineStartX = data.x + data.w * sideFraction;
            lineStartY = data.y + data.h;
            break;
        case "top":
            lineStartX = data.x + data.w * sideFraction;
            lineStartY = data.y;
            break;
        case "left":
            lineStartX = data.x;
            lineStartY = data.y + data.h * sideFraction;
            break;
        case "right":
            lineStartX = data.x + data.w;
            lineStartY = data.y + data.h * sideFraction;
            break;
    }
    // Handle dangling stream if lineEndX or lineEndY is null
    if (lineEndX === null || lineEndY === null) {
        console.log("Handling dangling streams");
        switch (dischargeAttachSide) {
            case "right":
                lineEndX = lineStartX + defaultLength;
                lineEndY = lineStartY;
                break;
            case "bottom":
                lineEndX = lineStartX;
                lineEndY = lineStartY + defaultLength;
                break;
            case "top":
                lineEndX = lineStartX;
                lineEndY = lineStartY - defaultLength;
                break;
            case "left":
                lineEndX = lineStartX - defaultLength;
                lineEndY = lineStartY;
                break;
        }
    }

    return { lineStartX, lineStartY, lineEndX, lineEndY, dischargeAttachSide, landingSide };
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
    var { lineStartX, lineStartY, lineEndX, lineEndY, dischargeAttachSide, landingSide } = calculateLineEndsToDischargeStream(group.data, idx);

    // Create a new polyline with at least 5 nodes using the SVG.js methods
    let polyCoordinates = [[lineStartX, lineStartY]]
    let extremeStartY = lineStartY;
    let insertIndex = 1;
    if (dischargeAttachSide === "bottom") {
        // insert coordinates after the first coordinates for a point that is vertically below the starting point, i.e. [lineStartX, lineStartY + defaultLength]
        extremeStartY += defaultLength;
        insertIndex += 1;
        //polyCoordinates = fiveNodeLine.slice(0, 1).concat([newPoint], fiveNodeLine.slice(1));
    } else if (dischargeAttachSide === "top") {
        extremeStartY -= defaultLength;
        insertIndex += 1;
    }
    
    let extremeEndY = lineEndY;
    if (landingSide === "bottom") {
        // insert coordinates after the first coordinates for a point that is vertically below the starting point, i.e. [lineStartX, lineStartY + defaultLength]
        extremeEndY += defaultLength;
        if (dischargeAttachSide === "bottom") { // i.e. same side and landing
            extremeEndY = Math.max(extremeEndY, extremeStartY);
            extremeStartY = extremeEndY;
        }
        var newPoint1 = [lineStartX, extremeStartY];
        var newPoint2 = [lineEndX, extremeEndY];
        polyCoordinates = polyCoordinates.concat([newPoint1, newPoint2])
        //polyCoordinates = fiveNodeLine.slice(0, 1).concat([newPoint], fiveNodeLine.slice(1));
    } else if (landingSide === "top") {
        extremeEndY -= defaultLength;
        if (dischargeAttachSide === "top") { // i.e. same side as landingSide
            extremeEndY = Math.min(extremeEndY, extremeStartY);
            extremeStartY = extremeEndY;
        }
        var newPoint1 = [lineStartX, extremeStartY];
        var newPoint2 = [lineEndX, extremeEndY];
        polyCoordinates = polyCoordinates.concat([newPoint1, newPoint2])
    } 

    // Calculate midpoint for orthogonal arrangement
    midPointX = (lineStartX + lineEndX) / 2; // or some other logic to determine the bend point
    midPointY = (extremeStartY + extremeEndY) / 2; // or some other logic to determine the bend point

    polyCoordinates = polyCoordinates.slice(0, insertIndex).concat([[midPointX, extremeStartY], [midPointX, midPointY], [midPointX, extremeEndY]], polyCoordinates.slice(insertIndex));
    
    // insert final point
    var endPoint = [lineEndX, lineEndY];
    polyCoordinates = polyCoordinates.concat([endPoint]);

    var newLine = group.polyline(polyCoordinates)
        .fill('none')
        .stroke({ color: '#000', width: 2 });

    let landedSide = landingSide;
    if (landingSide === null) { 
        if (dischargeAttachSide === "right") landedSide = "left";
        if (dischargeAttachSide === "left") landedSide = "right";
        if (dischargeAttachSide === "top") landedSide = "bottom";
        if (dischargeAttachSide === "bottom") landedSide = "top";
    }

    const landedSide = determineLandedSide(landingSide, dischargeAttachSide);
    var newArrow = drawArrow(group, landedSide, lineEndX, lineEndY)
    
    newArrow.fill('#000');

    // If you need to reference these later, you can assign them to properties on the group
    group.referencedLines.push(newLine);
    group.referencedArrows.push(newArrow);
}

function drawArrow(group, landedSide, lineEndX, lineEndY) {
    let newArrow;
    switch (landedSide) {
        case "right":
            newArrow = group.polygon(`0,0 ${arrowWidth},${arrowHeight} ${arrowWidth},-${arrowHeight}`);
            newArrow.move(lineEndX, lineEndY - arrowHeight);
            break;
        case "bottom":
            newArrow = group.polygon(`0,0 ${arrowHeight},0 0,-${arrowWidth} -${arrowHeight},0`);
            newArrow.move(lineEndX - arrowHeight, lineEndY);
            break;
        case "top":
            newArrow = group.polygon(`0,0 -${arrowHeight},0 0,${arrowWidth} ${arrowHeight},0`);
            newArrow.move(lineEndX - arrowHeight, lineEndY - arrowWidth);
            break;
        default: // "left"
            newArrow = group.polygon(`0,0 0,${arrowHeight} ${arrowWidth},0 0,-${arrowHeight}`);
            newArrow.move(lineEndX - arrowWidth, lineEndY - arrowHeight);
    }
    newArrow.fill('#000');
    return newArrow;
}

function determineLandedSide(landingSide, dischargeAttachSide) {
    if (landingSide !== null) {
        return landingSide;
    }
    switch (dischargeAttachSide) {
        case "right": return "left";
        case "left": return "right";
        case "top": return "bottom";
        case "bottom": return "top";
        default: return null;
    }
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