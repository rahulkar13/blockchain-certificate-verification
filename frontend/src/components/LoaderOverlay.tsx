// export default function LoaderOverlay() {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/40">
//       <div
//         className="w-[320px] p-8 rounded-2xl shadow-xl bg-white/20 backdrop-blur-2xl border border-white/30 animate-fadeIn"
//         style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}
//       >
//         {/* Blue Spinner */}
//         <div className="flex justify-center mb-4">
//           <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
//         </div>

//         {/* Creating Text */}
//         <h2 className="text-center text-black font-semibold text-lg mb-1 animate-pulse">
//           Creating Certificate...
//         </h2>

//         <p className="text-center text-black-200 text-sm">
//           Please wait a few moments...
//         </p>
//       </div>
//     </div>
//   );
// }


export default function LoaderOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">

      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 flex flex-col items-center gap-3">

        {/* Fast spinner */}
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>

        {/* Text */}
        <p className="text-gray-800 font-semibold text-base">
          Creating Certificate...
        </p>
        <p className="text-gray-500 text-sm -mt-2">
          Please wait...
        </p>
      </div>

    </div>
  );
}
