import React from "react";

const RightBar = () => {
  return (
    <div className="w-[8%] flex flex-col items-center gap-4 p-2 fixed right-0 top-0 bottom-0 bg-transparent">
      <button className="w-12 h-12 rounded-full bg-deep-purple text-white shadow-md hover:bg-medium-purple transition">
        1
      </button>
      <button className="w-12 h-12 rounded-full bg-deep-purple text-white shadow-md hover:bg-medium-purple transition">
        2
      </button>
      <button className="w-12 h-12 rounded-full bg-deep-purple text-white shadow-md hover:bg-medium-purple transition">
        3
      </button>
    </div>
  );
};

export default RightBar;
