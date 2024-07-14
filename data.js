// Assume we have an initial JSON object with group positions and IDs
export default plantData = {  // This will be retrieved by a call to the back-end
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