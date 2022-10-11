pipeline {
    agent any
    stages {
        stage('Test Node 12') {
            agent {
                docker {
                    image 'node:12-slim'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 14') {
            agent {
                docker {
                    image 'node:14-slim'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 16') {
            agent {
                docker {
                    image 'node:16-slim'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 18') {
            agent {
                docker {
                    image 'node:18-slim'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
    }
    post {
            // Clean after build
            always {
                cleanWs disableDeferredWipeout: true, deleteDirs: true
            }
        }
}