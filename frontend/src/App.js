import React, { useEffect } from "react";
import { getContract } from "./utils/contract";

function App() {
  useEffect(() => {
    const contract = getContract();
    if (contract) {
      contract.owner().then((ownerAddress) => {
        console.log("Contract Owner:", ownerAddress);
      });
    }
  }, []);

  return (
    <div>
      <h1>Blockchain Certificate System</h1>
    </div>
  );
}

export default App;
