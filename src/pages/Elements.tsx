import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Menu, Newspaper, BookOpen, FileText, ExternalLink } from "lucide-react";
import { motion } from 'framer-motion';

const Elements: React.FC = () => {
  useEffect(() => {
    document.title = "Machuca Elements";
    
    // Auto-redirect to Substack in a new tab
    window.open("https://machucaelements.substack.com/", "_blank");
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="container py-6 mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center space-x-2">
              <div className="bg-gray-100 p-1.5 md:p-2 rounded-md">
                <Newspaper className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
              </div>
              <div className="flex items-center space-x-2 md:space-x-4 overflow-hidden">
                <h1 className="text-xl md:text-2xl font-bold">Machuca Elements</h1>
                <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
                <Link to="/" className="text-gray-500 hover:text-gray-800 transition-colors flex items-center">
                  <BookOpen className="h-4 w-4 md:h-5 md:w-5 mr-1" />
                  <span className="text-sm md:text-lg">MV Directory</span>
                </Link>
                <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
                <Link to="/wiki" className="text-gray-500 hover:text-gray-800 transition-colors flex items-center">
                  <FileText className="h-4 w-4 md:h-5 md:w-5 mr-1" />
                  <span className="text-sm md:text-lg">Machuca Wiki</span>
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        <div className="w-full bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="max-w-2xl mx-auto">
            <Newspaper className="h-16 w-16 mx-auto mb-4 text-blue-500" />
            <h2 className="text-2xl font-bold mb-4">Machuca Elements</h2>
            <p className="text-gray-600 mb-6">You've been redirected to the Machuca Elements Substack in a new tab. If it didn't open automatically, click the button below:</p>
            
            <Button 
              onClick={() => window.open("https://machucaelements.substack.com/", "_blank")} 
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-md flex items-center mx-auto"
            >
              <ExternalLink className="h-5 w-5 mr-2" />
              Open Machuca Elements
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Elements;
